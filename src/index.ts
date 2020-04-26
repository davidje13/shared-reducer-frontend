import { update, combine, Spec } from 'json-immutability-helper';

interface Event<T> {
  change: Spec<T>;
  id?: number;
  error?: undefined;
}

interface ApiError {
  error: string;
  id?: number;
}

type SyncCallback<T> = (state: T) => void;
interface SpecGenerator<T> {
  afterSync?: false;
  (state: T): DispatchSpec<T>;
}
interface MarkedSyncCallback<T> extends SyncCallback<T> {
  afterSync: true;
}
type SpecFn<T> = SpecGenerator<T> | MarkedSyncCallback<T>;
type SpecSource<T> = Spec<T> | SpecFn<T> | null | undefined;

export type DispatchSpec<T> = SpecSource<T>[] | null | undefined;
export type Dispatch<T> = (specs: DispatchSpec<T>) => void;

const PING = 'P';
const PONG = 'p';
const PING_INTERVAL = 20 * 1000;

function isError(m: Event<unknown> | ApiError): m is ApiError {
  return m.error !== undefined;
}

function actionsHandledCallback<T>(callback?: (state: T) => void): SpecSource<T> {
  if (!callback) {
    return null;
  }
  return (state: T): null => {
    callback(state);
    return null;
  };
}

function actionsSyncedCallback<T>(callback?: (state: T) => void): SpecSource<T> {
  if (!callback) {
    return null;
  }
  const fn = (state: T): void => callback(state);
  fn.afterSync = true as true;
  return fn;
}

export { actionsHandledCallback, actionsSyncedCallback };

export default class SharedReducer<T> {
  private latestServerState?: T;

  private latestLocalState?: T;

  private currentChange?: Spec<T>;

  private localChanges: Event<T>[] = [];

  private pendingChanges: SpecSource<T>[] = [];

  private currentSyncCallbacks: SyncCallback<T>[] = [];

  private syncCallbacks = new Map<number, SyncCallback<T>[]>();

  private idCounter = 0;

  private ws: WebSocket;

  private pingTimeout: number | null = null;

  public constructor(
    wsUrl: string,
    token: string,
    private readonly changeCallback: ((state: T) => void) | undefined = undefined,
    private readonly errorCallback: ((error: string) => void) | undefined = undefined,
    private readonly warningCallback: ((error: string) => void) | undefined = undefined,
  ) {
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('message', this.handleMessage);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('close', this.handleClose);
    this.ws.addEventListener('open', () => this.ws.send(token), { once: true });
    this.queueNextPing();
  }

  public close(): void {
    this.ws.close();
    this.latestServerState = undefined;
    this.latestLocalState = undefined;
    this.currentChange = undefined;
    this.localChanges = [];
    this.pendingChanges = [];
    if (this.pingTimeout !== null) {
      window.clearTimeout(this.pingTimeout);
    }
  }

  public dispatch: Dispatch<T> = (specs) => {
    if (!specs || !specs.length) {
      return;
    }

    if (!this.getState()) {
      this.pendingChanges.push(...specs);
    } else if (this.internalApply(specs)) {
      this.internalNotify();
    }
  };

  public addSyncCallback(callback: SyncCallback<T>): void {
    if (this.currentChange !== undefined) {
      this.currentSyncCallbacks.push(callback);
      return;
    }
    const state = this.getState();
    if (state === undefined) {
      const initialSyncCallbacks = this.syncCallbacks.get(-1) || [];
      initialSyncCallbacks.push(callback);
      this.syncCallbacks.set(-1, initialSyncCallbacks);
    } else {
      callback(state);
    }
  }

  public getState(): T | undefined {
    if (!this.latestLocalState && this.latestServerState) {
      let state = update(
        this.latestServerState,
        combine(this.localChanges.map(({ change }) => change)),
      );
      if (this.currentChange) {
        state = update(state, this.currentChange);
      }
      this.latestLocalState = state;
    }
    return this.latestLocalState;
  }

  private getStateKnownAvailable(): T {
    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    return this.getState()!;
  }

  private queueNextPing(): void {
    if (this.pingTimeout !== null) {
      window.clearTimeout(this.pingTimeout);
    }
    this.pingTimeout = window.setTimeout(this.sendPing, PING_INTERVAL);
  }

  private internalGetUniqueId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private internalNotify(): void {
    this.changeCallback?.(this.getStateKnownAvailable());
  }

  private internalApplySyncCallbacks(id: number): void {
    const callbacks = this.syncCallbacks.get(id);
    if (callbacks) {
      this.syncCallbacks.delete(id);
      const state = this.getStateKnownAvailable();
      callbacks.forEach((fn) => fn(state));
    }
  }

  private internalSend = (): void => {
    if (this.currentChange === undefined) {
      return;
    }

    const event = {
      change: this.currentChange,
      id: this.internalGetUniqueId(),
    };
    this.localChanges.push(event);
    if (this.currentSyncCallbacks.length > 0) {
      this.syncCallbacks.set(event.id, this.currentSyncCallbacks);
      this.currentSyncCallbacks = [];
    }
    this.ws.send(JSON.stringify(event));
    this.currentChange = undefined;
  };

  private internalApplyPart(change: SpecSource<T>): boolean {
    if (!change) {
      return false;
    }

    const oldState = this.getStateKnownAvailable();

    if (typeof change === 'function') {
      if (change.afterSync) {
        this.addSyncCallback(change);
        return false;
      }
      return this.internalApply(change(oldState));
    }

    this.latestLocalState = update(oldState, change);
    if (this.latestLocalState === oldState) {
      // nothing changed
      return false;
    }

    if (this.currentChange === undefined) {
      this.currentChange = change;
      setTimeout(this.internalSend, 0);
    } else {
      this.currentChange = combine<T>([this.currentChange, change]);
    }
    return true;
  }

  private internalApplyCombined(changes: Spec<T>[]): boolean {
    return this.internalApplyPart(combine<T>(changes));
  }

  private internalApply(changes: DispatchSpec<T>): boolean {
    if (!changes || !changes.length) {
      return false;
    }

    let anyChange = false;
    const aggregate: Spec<T>[] = [];
    changes.forEach((change) => {
      if (change && typeof change !== 'function') {
        aggregate.push(change);
      } else {
        if (aggregate.length > 0) {
          anyChange = this.internalApplyCombined(aggregate) || anyChange;
          aggregate.length = 0;
        }
        anyChange = this.internalApplyPart(change) || anyChange;
      }
    });
    if (aggregate.length > 0) {
      anyChange = this.internalApplyCombined(aggregate) || anyChange;
    }
    return anyChange;
  }

  private internalApplyPendingChanges(): boolean {
    if (!this.pendingChanges.length || !this.getState()) {
      return false;
    }

    const anyChange = this.internalApply(this.pendingChanges);
    this.pendingChanges.length = 0;
    return anyChange;
  }

  private handleMessage = ({ data }: { data: string }): void => {
    this.queueNextPing();
    if (data === PONG) {
      return;
    }

    const isFirst = this.latestServerState === undefined;
    const message = JSON.parse(data) as Event<T> | ApiError;

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
    if (this.internalApplyPendingChanges() || changed) {
      this.internalNotify();
    }
    if (isFirst) {
      this.internalApplySyncCallbacks(-1);
    }
    if (message.id !== undefined) {
      this.internalApplySyncCallbacks(message.id);
    }
  };

  private sendPing = (): void => {
    this.ws.send(PING);
  };

  private handleError = (): void => {
    this.errorCallback?.('Failed to connect');
  };

  private handleClose = (): void => {
    if (this.pingTimeout !== null) {
      window.clearTimeout(this.pingTimeout);
    }
  };
}
