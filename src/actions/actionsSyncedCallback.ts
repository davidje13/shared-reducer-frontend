import { SyncCallback } from '../DispatchSpec';

const NOP = (): null => null;

export default function actionsSyncedCallback<T>(
  resolve?: (state: T) => void,
  reject?: (message: string) => void,
): SyncCallback<T> | null {
  if (!resolve && !reject) {
    return null;
  }
  return new SyncCallback(resolve || NOP, reject || NOP);
}
