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

interface LocalChange<T> {
  change: Spec<T>;
  id: number;
  syncCallbacks: SyncCallback<T>[];
}

interface LocalChangeIndex<T> {
  localChange: LocalChange<T> | null;
  index: number;
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

  private localChanges: LocalChange<T>[] = [];

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

  public addSyncCallback(
    resolve: (state: T) => void,
    reject?: (message: string) => void,
  ): void {
    this.dispatch([actionsSyncedCallback(resolve, reject)]);
  }

  public syncedState(): Promise<T> {
    return new Promise((resolve, reject) => {
      this.addSyncCallback(resolve, reject);
    });
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

    const id = this.nextId();
    const change = this.currentChange;
    const syncCallbacks = this.currentSyncCallbacks;
    this.currentChange = undefined;
    this.currentSyncCallbacks = [];

    this.localChanges.push({ change, id, syncCallbacks });
    this.connection.send({ change, id });
  };

  private addCurrentChange(spec: Spec<T>): void {
    if (!this.currentChange) {
      this.currentChange = spec;
      setTimeout(this.sendCurrentChange, 0);
    } else {
      this.currentChange = combine<T>([this.currentChange, spec]);
    }
  }

  private applySpecs(oldState: T, specs: SpecSource<T>[], forceChangeCallback: boolean): T {
    if (!specs.length) { // optimisation for pendingChanges
      if (forceChangeCallback) {
        this.changeCallback?.(oldState);
      }
      return oldState;
    }

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
      this.addCurrentChange(delta);
    }
    if (state !== oldState || forceChangeCallback) {
      this.changeCallback?.(state);
    }
    return state;
  }

  private popLocalChange(id: number | undefined): LocalChangeIndex<T> {
    const index = (id === undefined) ? -1 : this.localChanges.findIndex((c) => (c.id === id));
    if (index === -1) {
      return { localChange: null, index };
    }
    return {
      localChange: this.localChanges.splice(index, 1)[0],
      index,
    };
  }

  private handleMessage = (data: unknown): void => {
    const message = data as Event<T> | ApiError;

    const { localChange, index } = this.popLocalChange(message.id);

    if (isError(message)) {
      this.warningCallback?.(`Update failed: ${message.error}`);
      this.latestLocalState = undefined;
      const state = this.getState();
      if (state) {
        this.changeCallback?.(state);
      }
      localChange?.syncCallbacks.forEach((fn) => fn.reject?.(message.error));
      return;
    }

    // if first, removed the oldest pending change and applied it to
    // the base server state: nothing has changed
    const changedOrder = (index !== 0);

    this.latestServerState = update(this.latestServerState || ({} as T), message.change);

    if (!this.latestLocalState || changedOrder) {
      this.latestLocalState = this.localStateFromServerState(this.latestServerState);
    }
    let state = this.latestLocalState;
    state = this.applySpecs(state, this.pendingChanges, changedOrder);
    this.pendingChanges.length = 0;
    localChange?.syncCallbacks.forEach((fn) => fn(state));
  };
}
