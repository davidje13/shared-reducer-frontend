import type { Spec } from 'json-immutability-helper';
export declare type SyncCallback<T> = (state: T) => void;
interface MarkedSyncCallback<T> extends SyncCallback<T> {
    afterSync: true;
}
interface SpecGenerator<T> {
    afterSync?: false;
    (state: T): SpecSource<T>[] | null | undefined;
}
export declare type SpecSource<T> = (Spec<T> | SpecGenerator<T> | MarkedSyncCallback<T> | null | undefined);
export declare type Dispatch<T> = (specs: SpecSource<T>[] | null | undefined) => void;
export declare type DispatchSpec<T> = SpecSource<T>[];
export {};
//# sourceMappingURL=DispatchSpec.d.ts.map