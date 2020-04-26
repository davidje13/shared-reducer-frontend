import type { Spec } from 'json-immutability-helper';

export type SyncCallback<T> = (state: T) => void;
interface MarkedSyncCallback<T> extends SyncCallback<T> {
  afterSync: true;
}
interface SpecGenerator<T> {
  afterSync?: false;
  (state: T): DispatchSpec<T>;
}
export type SpecSource<T> = (
  Spec<T> |
  SpecGenerator<T> |
  MarkedSyncCallback<T> |
  null |
  undefined
);

export type DispatchSpec<T> = SpecSource<T>[] | null | undefined;
export type Dispatch<T> = (specs: DispatchSpec<T>) => void;
