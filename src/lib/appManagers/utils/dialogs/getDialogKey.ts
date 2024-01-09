import {AnyDialog} from '../../../storages/dialogs';
import {isDialog, isForumTopic, isSavedDialog} from './isDialog';

export default function getDialogKey(dialog: AnyDialog) {
  let key: number;
  if(isDialog(dialog)) {
    key = dialog.peerId;
  } else if(isForumTopic(dialog)) {
    key = dialog.id;
  } else if(isSavedDialog(dialog)) {
    key = dialog.savedPeerId;
  }

  return key;
}
