import type { Dispatch, SyncCallback } from './DispatchSpec';
export default class SharedReducer<T> {
    private readonly changeCallback;
    private readonly warningCallback;
    private connection;
    private latestServerState?;
    private latestLocalState?;
    private currentChange?;
    private currentSyncCallbacks;
    private localChanges;
    private pendingChanges;
    private dispatchLock;
    private nextId;
    constructor(wsUrl: string, token?: string | undefined, changeCallback?: ((state: T) => void) | undefined, errorCallback?: ((error: string) => void) | undefined, warningCallback?: ((error: string) => void) | undefined);
    close(): void;
    dispatch: Dispatch<T>;
    addSyncCallback(callback: SyncCallback<T>): void;
    getState(): T | undefined;
    private localStateFromServerState;
    private sendCurrentChange;
    private addCurrentChange;
    private applySpecs;
    private popLocalChange;
    private handleMessage;
}
//# sourceMappingURL=SharedReducer.d.ts.map