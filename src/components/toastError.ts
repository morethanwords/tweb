import {toastNew} from '@components/toast';

/**
 * A request that failed, said in the generic error toast - but for one of an account session the tab has left meanwhile,
 * whose session-bound managers drop the answer (`MIDDLEWARE`): that says nothing
 */
export default function toastError(err: ApiError, label: string) {
  if(err?.type === 'MIDDLEWARE') {
    return;
  }

  console.error(label, err);
  toastNew({langPackKey: 'Error.AnError'});
}
