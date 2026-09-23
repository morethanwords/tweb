/**
 * What a multi-chat action bar can offer for the dialogs it has selected. An absent key is an
 * action that is not offered at all; the boolean is the direction it would take - `pin: false`
 * unpins, `read: false` marks unread.
 */
export type DialogsSelectionActions = Partial<{
  pin: boolean,
  mute: boolean,
  read: boolean,
  archive: boolean,
  delete: boolean
}>;

/** One selected dialog, in the terms the decision below is made in */
export type DialogSelectionState = {
  /** in the list the selection was made in, which is not always the one the dialog lives in */
  pinned: boolean,
  unread: boolean,
  forum: boolean,
  muted: boolean,
  archived: boolean,
  /** our own chat, which can be neither muted nor archived */
  self: boolean
};

/**
 * Which of the multi-chat actions a selection of dialogs can be offered, decided the way the other
 * clients decide it (`DialogsActivity.updateSelectedCount`): an action is offered while it has
 * somewhere to take the selection, and the direction is the one that brings every chat to the same
 * state - one unpinned chat makes it "Pin", one unmuted one "Mute". An action that cannot be done
 * to one of them (muting or archiving our own chat) is not offered for any.
 */
export default function getDialogsSelectionActions(dialogs: DialogSelectionState[]): DialogsSelectionActions {
  const actions: DialogsSelectionActions = {};
  const count = dialogs.length;
  if(!count) {
    return actions;
  }

  let pinned = 0, unread = 0, forums = 0, muteable = 0, muted = 0, archivable = 0, archived = 0;
  for(const dialog of dialogs) {
    if(dialog.pinned) ++pinned;
    if(dialog.unread) ++unread;
    if(dialog.forum) ++forums;

    if(!dialog.self) {
      ++muteable;
      if(dialog.muted) ++muted;

      ++archivable;
      if(dialog.archived) ++archived;
    }
  }

  // * the directions are Android's own (`DialogsActivity.updateSelectedCount`), and they are not
  // * symmetrical: pinning is offered while anything is unpinned, while one muted or one archived
  // * chat is enough for the whole selection to be unmuted or unarchived
  actions.pin = pinned < count;
  if(muteable === count) actions.mute = !muted;
  if(archivable === count) actions.archive = !archived;
  actions.delete = true;

  // * a forum has no unread mark to put back, so a selection with one in it can only be read
  if(unread) actions.read = true;
  else if(!forums) actions.read = false;

  return actions;
}
