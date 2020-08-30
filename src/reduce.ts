import { update, combine, Spec } from 'json-immutability-helper';
import type { SpecSource, SyncCallback } from './DispatchSpec';

interface StackFrame<T> {
  vs: T[];
  i: number;
  prev: StackFrame<T> | null;
}

function iterateStack<T>(
  initial: T[],
  fn: (v: T) => T[] | null | undefined,
): void {
  let cur: StackFrame<T> | null = { vs: initial, i: 0, prev: null };
  while (cur) {
    if (cur.i >= cur.vs.length) {
      cur = cur.prev;
    } else {
      const next = fn(cur.vs[cur.i]);
      cur.i += 1;
      if (next && next.length) {
        cur = { vs: next, i: 0, prev: cur };
      }
    }
  }
}

interface ReductionResult<T> {
  state: T;
  delta: Spec<T>;
}

export default function reduce<T>(
  oldState: T,
  baseChanges: SpecSource<T>[],
  registerSyncCallback: (fn: SyncCallback<T>, currentState: T) => void,
): ReductionResult<T> {
  let state: T = oldState;

  const allChanges: Spec<T>[] = [];
  const aggregate: Spec<T>[] = [];
  function applyAggregate(): void {
    if (aggregate.length > 0) {
      const combinedChange = combine<T>(aggregate);
      allChanges.push(combinedChange);
      state = update(state, combinedChange);
      aggregate.length = 0;
    }
  }

  iterateStack(baseChanges, (change) => {
    if (typeof change === 'function') {
      applyAggregate();
      if (change.afterSync) {
        registerSyncCallback(change, state);
        return null;
      }
      return change(state);
    }
    if (change) {
      aggregate.push(change);
    }
    return null;
  });
  applyAggregate();
  return { state, delta: combine<T>(allChanges) };
}
