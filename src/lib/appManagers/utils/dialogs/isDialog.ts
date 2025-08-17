import type {AnyDialog} from '../../../storages/dialogs';
import type {ForumTopic, SavedDialog, Dialog, MonoforumDialog} from '../../appMessagesManager';

export function isForumTopic(dialog: AnyDialog): dialog is ForumTopic {
  return dialog?._ === 'forumTopic';
}

export function isSavedDialog(dialog: AnyDialog): dialog is SavedDialog {
  return dialog?._ === 'savedDialog';
}

export function isMonoforumDialog(dialog: AnyDialog | MonoforumDialog): dialog is MonoforumDialog {
  return dialog?._ === 'monoForumDialog';
}

export function isDialog(dialog: AnyDialog): dialog is Dialog {
  return dialog?._ === 'dialog';
}
