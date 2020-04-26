import type { SpecSource } from '../DispatchSpec';

export default function actionsSyncedCallback<T>(
  callback?: (state: T) => void,
): SpecSource<T> {
  if (!callback) {
    return null;
  }
  const fn = (state: T): void => callback(state);
  fn.afterSync = true as true;
  return fn;
}
