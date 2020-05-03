import {
  Broadcaster,
  websocketHandler,
  InMemoryModel,
  ReadWrite,
  ReadOnly,
} from 'shared-reducer-backend';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import WebSocketExpress from 'websocket-express';
import SharedReducer from '../src/SharedReducer';

interface TestT {
  foo: string;
  bar: number;
}

const model = new InMemoryModel<TestT>();
const broadcaster = new Broadcaster(model);

const app = new WebSocketExpress();
const handler = websocketHandler(broadcaster);
app.ws('/:id/read', handler((req) => req.params.id, () => ReadOnly));
app.ws('/:id', handler((req) => req.params.id, () => ReadWrite));

function addressToString(addr: AddressInfo | string, protocol = 'http'): string {
  if (typeof addr === 'string') {
    return addr;
  }
  const { address, family, port } = addr;
  const host = (family === 'IPv6') ? `[${address}]` : address;
  return `${protocol}://${host}:${port}`;
}

describe('e2e', () => {
  let server: Server | undefined;
  let reducer: SharedReducer<TestT> | undefined;
  let reducer2: SharedReducer<TestT> | undefined;
  let host = '';

  beforeEach((done) => {
    model.set('a', { foo: 'v1', bar: 10 });
    server = app.listen(0, 'localhost', done);
  });

  beforeEach(() => {
    host = addressToString(server!.address()!, 'ws');
    reducer = undefined;
    reducer2 = undefined;
  });

  afterEach((done) => {
    reducer?.close();
    reducer2?.close();
    server?.close(done);
  });

  describe('one client', () => {
    it('sends initial state from server to client', (done) => {
      reducer = new SharedReducer<TestT>(
        `${host}/a`,
        undefined,
        (state) => {
          expect(state).toEqual({ foo: 'v1', bar: 10 });
          done();
        },
        done.fail,
        done.fail
      );
    });

    it('invokes synchronize callbacks when state is first retrieved', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      const state = await reducer.syncedState();
      expect(state).toEqual({ foo: 'v1', bar: 10 });
    });

    it('reflects state changes back to the sender', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await reducer.syncedState();

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      const state = await reducer.syncedState();

      expect(state).toEqual({ foo: 'v2', bar: 10 });
    });

    it('pushes external state changes', (done) => {
      let waiting = false;
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, (state) => {
        if (!waiting) {
          return;
        }
        expect(state).toEqual({ foo: 'v2', bar: 10 });
        done();
      }, fail, fail);

      reducer.syncedState().then(() => {
        waiting = true;
        return broadcaster.update('a', { foo: ['=', 'v2'] });
      });
    });

    it('merges external state changes', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await reducer.syncedState();

      await broadcaster.update('a', { foo: ['=', 'v2'] });
      reducer.dispatch([{ bar: ['=', 11] }])
      const state = await reducer.syncedState();

      expect(state).toEqual({ foo: 'v2', bar: 11 });
    });

    it('maintains local state changes until the server syncs', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await reducer.syncedState();

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      expect(reducer.getState()).toEqual({ foo: 'v2', bar: 10 });
    });

    it('applies local state changes on top of the server state', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await reducer.syncedState();

      await broadcaster.update('a', { bar: ['=', 20] });

      reducer.dispatch([{ bar: ['+', 5] }]);
      expect(reducer.getState()!.bar).toEqual(15); // not synced with server yet

      await reducer.syncedState();
      expect(reducer.getState()!.bar).toEqual(25); // now synced, local change applies on top
    });
  });

  describe('readonly client', () => {
    it('invokes the warning callback when the server rejects a change', (done) => {
      reducer = new SharedReducer<TestT>(
        `${host}/a/read`,
        undefined,
        undefined,
        done.fail,
        (warning: string) => {
          expect(warning).toEqual('Update failed: Cannot modify data');
          done();
        },
      );

      reducer.dispatch([{ bar: ['=', 11] }]);
    });

    it('rolls back local change when rejected by server', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a/read`, undefined, undefined, fail, undefined);
      await reducer.syncedState();

      reducer.dispatch([{ bar: ['=', 11] }]);
      expect(reducer.getState()!.bar).toEqual(11); // not synced with server yet

      try {
        await reducer.syncedState();
      } catch (ignore) {}
      expect(reducer.getState()!.bar).toEqual(10); // now synced, local change reverted
    });

    it('rejects sync promises when rejected by server', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a/read`, undefined, undefined, fail, undefined);
      await reducer.syncedState();

      reducer.dispatch([{ bar: ['=', 11] }]);

      await expect(reducer.syncedState()).rejects.toEqual('Cannot modify data');
    });
  });

  describe('two clients', () => {
    it('pushes changes between clients', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      reducer2 = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await reducer.syncedState();
      await reducer2.syncedState();

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      await reducer.syncedState();
      reducer2.dispatch([{ bar: ['=', 20] }]);
      await reducer2.syncedState();

      expect(reducer2.getState()).toEqual({ foo: 'v2', bar: 20 });
    });
  });
});
