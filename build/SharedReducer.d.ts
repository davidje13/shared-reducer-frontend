import type { Dispatch, SyncCallback } from './DispatchSpec';
export default class SharedReducer<T> {
    private readonly changeCallback;
    private readonly errorCallback;
    private readonly warningCallback;
    private latestServerState?;
    private latestLocalState?;
    private currentChange?;
    private localChanges;
    private pendingChanges;
    private currentSyncCallbacks;
    private syncCallbacks;
    private idCounter;
    private ws;
    private pingTimeout;
    constructor(wsUrl: string, token: string, changeCallback?: ((state: T) => void) | undefined, errorCallback?: ((error: string) => void) | undefined, warningCallback?: ((error: string) => void) | undefined);
    close(): void;
    dispatch: Dispatch<T>;
    addSyncCallback(callback: SyncCallback<T>): void;
    getState(): T | undefined;
    private getStateKnownAvailable;
    private queueNextPing;
    private internalGetUniqueId;
    private internalNotify;
    private internalApplySyncCallbacks;
    private internalSend;
    private internalApplyPart;
    private internalApplyCombined;
    private internalApply;
    private internalApplyPendingChanges;
    private handleMessage;
    private sendPing;
    private handleError;
    private handleClose;
}
//# sourceMappingURL=SharedReducer.d.ts.map