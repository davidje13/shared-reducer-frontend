import type {
  Context,
  Dispatch,
  SpecSource,
  SyncCallback,
} from './DispatchSpec';
import WebSocketConnection from './WebSocketConnection';
import reduce from './reduce';
import actionsSyncedCallback from './actions/actionsSyncedCallback';
import idProvider from './idProvider';
import lock from './lock';

interface InitEvent<T> {
  init: T;
  id?: undefined;
}

interface ChangeEvent<SpecT> {
  change: SpecT;
  id?: number;
}

interface LocalChange<T, SpecT> {
  change: SpecT;
  id: number;
  syncCallbacks: SyncCallback<T>[];
}

interface LocalChangeIndex<T, SpecT> {
  localChange: LocalChange<T, SpecT> | null;
  index: number;
}

interface ApiError {
  error: string;
  id?: number;
}

interface State<T> {
  readonly server: T;
  readonly local: T;
}

interface SharedReducerBuilder<T, SpecT> {
  withReducer<SpecT2 extends SpecT>(
    context: Context<T, SpecT2>,
  ): SharedReducerBuilder<T, SpecT2>;

  withToken(token: string): this;

  withErrorHandler(handler: (error: string) => void): this;

  withWarningHandler(handler: (error: string) => void): this;

  build(): SharedReducer<T, SpecT>;
}

export default class SharedReducer<T, SpecT> {
  private connection: WebSocketConnection;

  private latestStates: State<T> | null = null;

  private currentChange?: SpecT;

  private currentSyncCallbacks: SyncCallback<T>[] = [];

  private localChanges: LocalChange<T, SpecT>[] = [];

  private pendingChanges: SpecSource<T, SpecT>[] = [];

  private dispatchLock = lock('Cannot dispatch recursively');

  private nextId = idProvider();

  private constructor(
    private readonly context: Context<T, SpecT>,
    wsUrl: string,
    token: string | undefined,
    private readonly changeHandler: ((state: T) => void) | undefined,
    errorHandler: ((error: string) => void) | undefined,
    private readonly warningHandler: ((error: string) => void) | undefined,
  ) {
    this.connection = new WebSocketConnection(
      wsUrl,
      token,
      this.handleMessage,
      errorHandler,
    );
  }

  public static for<T2>(
    wsUrl: string,
    changeHandler?: (state: T2) => void,
  ): SharedReducerBuilder<T2, unknown> {
    let bContext: Context<T2, unknown>;
    let bToken: string;
    let bErrorHandler: (error: string) => void;
    let bWarningHandler: (error: string) => void;

    // return types are defined in SharedReducerBuilder interface */
    /* eslint-disable @typescript-eslint/explicit-function-return-type */
    const builder = {
      withReducer(context: Context<T2, unknown>) {
        bContext = context;
        return builder;
      },

      withToken(token: string) {
        bToken = token;
        return builder;
      },

      withErrorHandler(handler: (error: string) => void) {
        bErrorHandler = handler;
        return builder;
      },

      withWarningHandler(handler: (error: string) => void) {
        bWarningHandler = handler;
        return builder;
      },

      build() {
        if (!bContext) {
          throw new Error('must set broadcaster context');
        }
        return new SharedReducer(
          bContext,
          wsUrl,
          bToken,
          changeHandler,
          bErrorHandler,
          bWarningHandler,
        );
      },
    };
    return builder as SharedReducerBuilder<T2, unknown>;
  }

  public close(): void {
    this.connection.close();
    this.latestStates = null;
    this.currentChange = undefined;
    this.currentSyncCallbacks = [];
    this.localChanges = [];
    this.pendingChanges = [];
  }

  public dispatch: Dispatch<T, SpecT> = (specs) => {
    if (!specs || !specs.length) {
      return;
    }

    if (this.latestStates) {
      const updatedState = this.applySpecs(this.latestStates, specs);
      if (updatedState !== this.latestStates) {
        this.latestStates = updatedState;
        this.changeHandler?.(updatedState.local);
      }
    } else {
      this.pendingChanges.push(...specs);
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
    return this.latestStates?.local;
  }

  private sendCurrentChange = (): void => {
    if (this.currentChange === undefined) {
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

  private addCurrentChange(spec: SpecT): void {
    if (this.currentChange === undefined) {
      this.currentChange = spec;
      setTimeout(this.sendCurrentChange, 0);
    } else {
      this.currentChange = this.context.combine([this.currentChange, spec]);
    }
  }

  private applySpecs(old: State<T>, specs: SpecSource<T, SpecT>[]): State<T> {
    if (!specs.length) { // optimisation for pendingChanges
      return old;
    }

    const { state, delta } = this.dispatchLock(() => reduce(
      this.context,
      old.local,
      specs,
      (syncCallback, curState) => {
        if (curState === old.local && this.currentChange === undefined) {
          syncCallback.sync(old.local);
        } else {
          this.currentSyncCallbacks.push(syncCallback);
        }
      },
    ));

    if (state === old.local) {
      return old;
    }

    this.addCurrentChange(delta);
    return {
      server: old.server,
      local: state,
    };
  }

  private popLocalChange(id: number | undefined): LocalChangeIndex<T, SpecT> {
    const index = (id === undefined) ? -1 : this.localChanges.findIndex((c) => (c.id === id));
    if (index === -1) {
      return { localChange: null, index };
    }
    return {
      localChange: this.localChanges.splice(index, 1)[0],
      index,
    };
  }

  private handleErrorMessage(message: ApiError): void {
    const { localChange } = this.popLocalChange(message.id);
    if (!localChange) {
      this.warningHandler?.(`API sent error: ${message.error}`);
      return;
    }
    this.warningHandler?.(`API rejected update: ${message.error}`);
    if (this.latestStates) {
      this.latestStates = this.computeLocal(this.latestStates.server);
      this.changeHandler?.(this.latestStates.local);
    }
    localChange.syncCallbacks.forEach((fn) => fn.reject(message.error));
  }

  private handleInitMessage(message: InitEvent<T>): void {
    this.latestStates = this.applySpecs(this.computeLocal(message.init), this.pendingChanges);
    this.pendingChanges.length = 0;
    this.changeHandler?.(this.latestStates.local);
  }

  private handleChangeMessage(message: ChangeEvent<SpecT>): void {
    if (!this.latestStates) {
      this.warningHandler?.(`Ignoring change before init: ${JSON.stringify(message)}`);
      return;
    }

    const { localChange, index } = this.popLocalChange(message.id);

    const server = this.context.update(this.latestStates.server, message.change);

    if (index === 0) {
      // just removed the oldest pending change and applied it to
      // the base server state: nothing has changed
      this.latestStates = { server, local: this.latestStates.local };
    } else {
      this.latestStates = this.computeLocal(server);
      this.changeHandler?.(this.latestStates.local);
    }
    const state = this.latestStates.local;
    localChange?.syncCallbacks.forEach((callback) => callback.sync(state));
  }

  private handleMessage = (message: unknown): void => {
    if (Object.prototype.hasOwnProperty.call(message, 'change')) {
      this.handleChangeMessage(message as ChangeEvent<SpecT>);
    } else if (Object.prototype.hasOwnProperty.call(message, 'init')) {
      this.handleInitMessage(message as InitEvent<T>);
    } else if (Object.prototype.hasOwnProperty.call(message, 'error')) {
      this.handleErrorMessage(message as ApiError);
    } else {
      this.warningHandler?.(`Ignoring unknown API message: ${JSON.stringify(message)}`);
    }
  };

  private computeLocal(server: T): State<T> {
    let local = server;
    if (this.localChanges.length > 0) {
      const changes = this.context.combine(this.localChanges.map(({ change }) => change));
      local = this.context.update(local, changes);
    }
    if (this.currentChange !== undefined) {
      local = this.context.update(local, this.currentChange);
    }
    return { server, local };
  }
}
