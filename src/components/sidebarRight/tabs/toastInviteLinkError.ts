import {toastNew} from '@components/toast';

/**
 * A change of an invite link the server would not take, said in a toast - the server's own reason has no string here.
 * A session that ended meanwhile (another account opened in the tab) drops the answer on purpose: no error to show
 * over the next account
 */
export default function toastInviteLinkError(err: ApiError, label: string) {
  if(err?.type === 'MIDDLEWARE') {
    return;
  }

  console.error(label, err);
  toastNew({langPackKey: 'Error.AnError'});
}
