import type {AnyDialog} from '../../../storages/dialogs';
import getDialogKey from './getDialogKey';
import {isDialog} from './isDialog';

export default function getDialogThreadId(dialog: AnyDialog) {
  if(isDialog(dialog)) {
    return;
  }

  return getDialogKey(dialog);
}
