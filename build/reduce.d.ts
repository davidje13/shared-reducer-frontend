import { Context, SpecSource, SyncCallback } from './DispatchSpec';
interface ReductionResult<T, SpecT> {
    state: T;
    delta: SpecT;
}
export default function reduce<T, SpecT>(context: Context<T, SpecT>, oldState: T, baseChanges: SpecSource<T, SpecT>[], registerSyncCallback: (fn: SyncCallback<T>, currentState: T) => void): ReductionResult<T, SpecT>;
export {};
//# sourceMappingURL=reduce.d.ts.map