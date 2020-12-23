export default function actionsHandledCallback<T>(
  callback?: (state: T) => void,
): ((state: T) => null) | null {
  if (!callback) {
    return null;
  }
  return (state: T): null => {
    callback(state);
    return null;
  };
}
