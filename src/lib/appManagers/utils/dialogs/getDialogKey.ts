import {AnyDialog} from '../../../storages/dialogs';
import {isForumTopic, isSavedDialog} from './isDialog';

export default function getDialogKey(dialog: AnyDialog) {
  let key: number;
  if(isForumTopic(dialog)) {
    key = dialog.id;
  } else if(isSavedDialog(dialog)) {
    key = dialog.savedPeerId;
  } else {
    key = dialog.peerId;
  }

  return key;
}
