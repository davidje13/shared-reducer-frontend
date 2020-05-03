import { update, combine, Spec } from 'json-immutability-helper';
import type {
  Dispatch,
  SpecSource,
  SyncCallback,
} from './DispatchSpec';
import WebSocketConnection from './WebSocketConnection';
import reduce from './reduce';
import actionsSyncedCallback from './actions/actionsSyncedCallback';
import idProvider from './idProvider';
import lock from './lock';

interface Event<T> {
  change: Spec<T>;
  id?: number;
  error?: undefined;
}

interface ApiError {
  error: string;
  id?: number;
}

function isError(m: Event<unknown> | ApiError): m is ApiError {
  return m.error !== undefined;
}

export default class SharedReducer<T> {
  private connection: WebSocketConnection;

  private latestServerState?: T;

  private latestLocalState?: T;

  private currentChange?: Spec<T>;

  private currentSyncCallbacks: SyncCallback<T>[] = [];

  private localChanges: Event<T>[] = [];

  private syncCallbacks = new Map<number, SyncCallback<T>[]>();

  private pendingChanges: SpecSource<T>[] = [];

  private dispatchLock = lock('Cannot dispatch recursively');

  private nextId = idProvider();

  public constructor(
    wsUrl: string,
    token: string | undefined = undefined,
    private readonly changeCallback: ((state: T) => void) | undefined = undefined,
    errorCallback: ((error: string) => void) | undefined = undefined,
    private readonly warningCallback: ((error: string) => void) | undefined = undefined,
  ) {
    this.connection = new WebSocketConnection(
      wsUrl,
      token,
      this.handleMessage,
      errorCallback,
    );
  }

  public close(): void {
    this.connection.close();
    this.latestServerState = undefined;
    this.latestLocalState = undefined;
    this.currentChange = undefined;
    this.currentSyncCallbacks = [];
    this.localChanges = [];
    this.syncCallbacks.clear();
    this.pendingChanges = [];
  }

  public dispatch: Dispatch<T> = (specs) => {
    if (!specs || !specs.length) {
      return;
    }

    const oldState = this.getState();
    if (oldState === undefined) {
      this.pendingChanges.push(...specs);
    } else {
      this.applySpecs(oldState, specs, false);
    }
  };

  public addSyncCallback(callback: SyncCallback<T>): void {
    this.dispatch([actionsSyncedCallback(callback)]);
  }

  public getState(): T | undefined {
    if (!this.latestLocalState && this.latestServerState) {
      this.latestLocalState = this.localStateFromServerState(this.latestServerState);
    }
    return this.latestLocalState;
  }

  private localStateFromServerState(serverState: T): T {
    let state = update(
      serverState,
      combine(this.localChanges.map(({ change }) => change)),
    );
    if (this.currentChange) {
      state = update(state, this.currentChange);
    }
    return state;
  }

  private sendCurrentChange = (): void => {
    if (!this.currentChange) {
      return;
    }

    const event = {
      change: this.currentChange,
      id: this.nextId(),
    };
    this.localChanges.push(event);
    if (this.currentSyncCallbacks.length > 0) {
      this.syncCallbacks.set(event.id, this.currentSyncCallbacks);
      this.currentSyncCallbacks = [];
    }
    this.connection.send(event);
    this.currentChange = undefined;
  };

  private applySpecs(oldState: T, specs: SpecSource<T>[], forceChangeCallback: boolean): T {
    const { state, delta } = this.dispatchLock(() => reduce(
      oldState,
      specs,
      (syncCallback, curState) => {
        if (curState === oldState && !this.currentChange) {
          syncCallback(oldState);
        } else {
          this.currentSyncCallbacks.push(syncCallback);
        }
      },
    ));

    if (state !== oldState) {
      this.latestLocalState = state;
      if (!this.currentChange) {
        this.currentChange = delta;
        setTimeout(this.sendCurrentChange, 0);
      } else {
        this.currentChange = combine<T>([this.currentChange, delta]);
      }
    }
    if (state !== oldState || forceChangeCallback) {
      this.changeCallback?.(state);
    }
    return state;
  }

  private handleMessage = (data: unknown): void => {
    const message = data as Event<T> | ApiError;

    const index = (message.id === undefined) ?
      -1 : this.localChanges.findIndex((c) => (c.id === message.id));
    if (index !== -1) {
      this.localChanges.splice(index, 1);
    }

    let changed = true;
    if (isError(message)) {
      this.warningCallback?.(`Update failed: ${message.error}`);
    } else {
      if (index === 0) {
        // removed the oldest pending change and applied it to the base
        // server state: nothing has changed
        changed = false;
      }
      this.latestServerState = update(
        this.latestServerState || ({} as T),
        message.change,
      );
    }

    if (changed) {
      this.latestLocalState = undefined;
    }
    let state = this.getState();
    if (this.pendingChanges.length && state !== undefined) {
      state = this.applySpecs(state, this.pendingChanges, changed);
      this.pendingChanges.length = 0;
    } else if (changed && state !== undefined) {
      this.changeCallback?.(state);
    }
    if (message.id !== undefined) {
      const callbacks = this.syncCallbacks.get(message.id);
      if (callbacks) {
        this.syncCallbacks.delete(message.id);
        const fixedState = state;
        if (fixedState === undefined) {
          throw new Error('Did not receive initial state from server');
        }
        callbacks.forEach((fn) => fn(fixedState));
      }
    }
  };
}
