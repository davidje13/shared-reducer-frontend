import type { Context, Dispatch } from './DispatchSpec';
interface SharedReducerBuilder<T, SpecT> {
    withReducer<SpecT2 extends SpecT>(context: Context<T, SpecT2>): SharedReducerBuilder<T, SpecT2>;
    withToken(token: string): this;
    withErrorHandler(handler: (error: string) => void): this;
    withWarningHandler(handler: (error: string) => void): this;
    build(): SharedReducer<T, SpecT>;
}
export default class SharedReducer<T, SpecT> {
    private readonly context;
    private readonly changeHandler;
    private readonly warningHandler;
    private connection;
    private latestStates;
    private currentChange?;
    private currentSyncCallbacks;
    private localChanges;
    private pendingChanges;
    private dispatchLock;
    private nextId;
    private constructor();
    static for<T2>(wsUrl: string, changeHandler?: (state: T2) => void): SharedReducerBuilder<T2, unknown>;
    close(): void;
    dispatch: Dispatch<T, SpecT>;
    addSyncCallback(resolve: (state: T) => void, reject?: (message: string) => void): void;
    syncedState(): Promise<T>;
    getState(): T | undefined;
    private sendCurrentChange;
    private addCurrentChange;
    private applySpecs;
    private popLocalChange;
    private handleErrorMessage;
    private handleInitMessage;
    private handleChangeMessage;
    private handleMessage;
    private computeLocal;
}
export {};
//# sourceMappingURL=SharedReducer.d.ts.map