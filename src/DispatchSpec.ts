import type { Spec } from 'json-immutability-helper';

export interface SyncCallback<T> {
  reject?: (message: string) => void;
  (state: T): void;
}
interface MarkedSyncCallback<T> extends SyncCallback<T> {
  afterSync: true;
}
interface SpecGenerator<T> {
  afterSync?: false;
  (state: T): SpecSource<T>[] | null | undefined;
}
export type SpecSource<T> = (
  Spec<T> |
  SpecGenerator<T> |
  MarkedSyncCallback<T> |
  null |
  undefined
);

export type DispatchSpec<T> = SpecSource<T>[];
export type Dispatch<T> = (specs: DispatchSpec<T> | null | undefined) => void;
