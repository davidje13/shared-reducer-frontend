import { Spec } from 'json-immutability-helper';
declare type SyncCallback<T> = (state: T) => void;
interface SpecGenerator<T> {
    afterSync?: false;
    (state: T): DispatchSpec<T>;
}
interface MarkedSyncCallback<T> extends SyncCallback<T> {
    afterSync: true;
}
declare type SpecFn<T> = SpecGenerator<T> | MarkedSyncCallback<T>;
declare type SpecSource<T> = Spec<T> | SpecFn<T> | null | undefined;
export declare type DispatchSpec<T> = SpecSource<T>[] | null | undefined;
export declare type Dispatch<T> = (specs: DispatchSpec<T>) => void;
declare function actionsHandledCallback<T>(callback?: (state: T) => void): SpecSource<T>;
declare function actionsSyncedCallback<T>(callback?: (state: T) => void): SpecSource<T>;
export { actionsHandledCallback, actionsSyncedCallback };
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
//# sourceMappingURL=index.d.ts.map