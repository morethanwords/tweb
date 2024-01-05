import type {AnyDialog} from '../../../storages/dialogs';
import type {ForumTopic, SavedDialog, Dialog} from '../../appMessagesManager';

export function isForumTopic(dialog: AnyDialog): dialog is ForumTopic {
  return dialog?._ === 'forumTopic';
}

export function isSavedDialog(dialog: AnyDialog): dialog is SavedDialog {
  return dialog?._ === 'savedDialog';
}

export function isDialog(dialog: AnyDialog): dialog is Dialog {
  return dialog?._ === 'dialog';
}
