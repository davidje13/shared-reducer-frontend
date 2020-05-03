import { Spec } from 'json-immutability-helper';
import type { SpecSource, SyncCallback } from './DispatchSpec';
interface ReductionResult<T> {
    state: T;
    delta: Spec<T>;
}
export default function reduce<T>(oldState: T, baseChanges: SpecSource<T>[], registerSyncCallback: (fn: SyncCallback<T>, currentState: T) => void): ReductionResult<T>;
export {};
//# sourceMappingURL=reduce.d.ts.map