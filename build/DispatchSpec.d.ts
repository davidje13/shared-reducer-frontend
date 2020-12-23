export interface Context<T, SpecT> {
    update: (input: T, spec: SpecT) => T;
    combine: (specs: SpecT[]) => SpecT;
}
export declare class SyncCallback<T> {
    readonly sync: (state: T) => void;
    readonly reject: (message: string) => void;
    constructor(sync: (state: T) => void, reject: (message: string) => void);
}
export declare type SpecGenerator<T, SpecT> = (state: T) => SpecSource<T, SpecT>[] | null | undefined;
export declare type SpecSource<T, SpecT> = (SpecT | SpecGenerator<T, SpecT> | SyncCallback<T> | null | undefined);
export declare type DispatchSpec<T, SpecT> = SpecSource<T, SpecT>[];
export declare type Dispatch<T, SpecT> = (specs: DispatchSpec<T, SpecT> | null | undefined) => void;
//# sourceMappingURL=DispatchSpec.d.ts.map