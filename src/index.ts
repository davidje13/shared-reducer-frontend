import type { Spec } from 'json-immutability-helper';
import type { DispatchSpec, Dispatch } from './DispatchSpec';
import actionsHandledCallback from './actions/actionsHandledCallback';
import actionsSyncedCallback from './actions/actionsSyncedCallback';
import SharedReducer from './SharedReducer';

export type { Spec, DispatchSpec, Dispatch };
export { actionsHandledCallback, actionsSyncedCallback };
export default SharedReducer;
