import type { SpecSource } from '../DispatchSpec';

export default function actionsSyncedCallback<T>(
  resolve?: (state: T) => void,
  reject?: (message: string) => void,
): SpecSource<T> {
  if (!resolve && !reject) {
    return null;
  }
  const fn = (state: T): void => resolve?.(state);
  fn.reject = reject;
  fn.afterSync = true as const;
  return fn;
}
