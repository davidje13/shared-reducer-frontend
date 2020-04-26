import type { SpecSource } from '../DispatchSpec';

export default function actionsHandledCallback<T>(
  callback?: (state: T) => void,
): SpecSource<T> {
  if (!callback) {
    return null;
  }
  return (state: T): null => {
    callback(state);
    return null;
  };
}
