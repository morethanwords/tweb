import type {AnyDialog} from '../../../storages/dialogs';
import type {MonoforumDialog} from '../../../storages/monoforumDialogs';
import type {Dialog, ForumTopic, SavedDialog} from '../../appMessagesManager';

export function isForumTopic(dialog: AnyDialog | MonoforumDialog): dialog is ForumTopic {
  return dialog?._ === 'forumTopic';
}

export function isSavedDialog(dialog: AnyDialog | MonoforumDialog): dialog is SavedDialog {
  return dialog?._ === 'savedDialog';
}

export function isMonoforumDialog(dialog: AnyDialog | MonoforumDialog): dialog is MonoforumDialog {
  return dialog?._ === 'monoForumDialog';
}

export function isDialog(dialog: AnyDialog | MonoforumDialog): dialog is Dialog {
  return dialog?._ === 'dialog';
}
