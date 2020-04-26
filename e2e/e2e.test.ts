import {
  Broadcaster,
  websocketHandler,
  InMemoryModel,
  ReadWrite,
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
app.ws('/:id', handler((req) => req.params.id, () => ReadWrite));

function addressToString(addr: AddressInfo | string, protocol = 'http'): string {
  if (typeof addr === 'string') {
    return addr;
  }
  const { address, family, port } = addr;
  const host = (family === 'IPv6') ? `[${address}]` : address;
  return `${protocol}://${host}:${port}`;
}

function nextSync<T>(reducer: SharedReducer<T>): Promise<T> {
  return new Promise((resolve) => {
    reducer.addSyncCallback(resolve);
  });
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
      const state = await nextSync(reducer);
      expect(state).toEqual({ foo: 'v1', bar: 10 });
    });

    it('reflects state changes back to the sender', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await nextSync(reducer);

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      const state = await nextSync(reducer);

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

      nextSync(reducer).then(() => {
        waiting = true;
        return broadcaster.update('a', { foo: ['=', 'v2'] });
      });
    });

    it('merges external state changes', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await nextSync(reducer);

      await broadcaster.update('a', { foo: ['=', 'v2'] });
      reducer.dispatch([{ bar: ['=', 11] }])
      const state = await nextSync(reducer);

      expect(state).toEqual({ foo: 'v2', bar: 11 });
    });

    it('maintains local state changes until the server syncs', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await nextSync(reducer);

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      expect(reducer.getState()).toEqual({ foo: 'v2', bar: 10 });
    });

    it('applies local state changes on top of the server state', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await nextSync(reducer);

      await broadcaster.update('a', { bar: ['=', 20] });

      reducer.dispatch([{ bar: ['+', 5] }]);
      expect(reducer.getState()!.bar).toEqual(15); // not synced with server yet

      await nextSync(reducer);
      expect(reducer.getState()!.bar).toEqual(25); // now synced, local change applies on top
    });
  });

  describe('two clients', () => {
    it('pushes changes between clients', async () => {
      reducer = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      reducer2 = new SharedReducer<TestT>(`${host}/a`, undefined, undefined, fail, fail);
      await nextSync(reducer);
      await nextSync(reducer2);

      reducer.dispatch([{ foo: ['=', 'v2'] }]);
      await nextSync(reducer);
      reducer2.dispatch([{ bar: ['=', 20] }]);
      await nextSync(reducer2);

      expect(reducer2.getState()).toEqual({ foo: 'v2', bar: 20 });
    });
  });
});
