import type {AnyDialog} from '@lib/storages/dialogs';
import getDialogKey from '@appManagers/utils/dialogs/getDialogKey';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';

export default function getDialogThreadId(dialog: AnyDialog) {
  if(isDialog(dialog)) {
    return;
  }

  return getDialogKey(dialog);
}
