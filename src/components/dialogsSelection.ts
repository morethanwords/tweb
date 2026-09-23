import {leaveChat} from '@components/popups/deleteDialog';
import showPinLimitReached from '@components/showPinLimitReached';
import {
  DialogsSelectionBase,
  DialogsSelectionBaseOptions,
  DialogsSelectionMenuItem,
  MENU_ITEM_DELETE,
  MENU_ITEM_READ,
  MENU_ITEMS_MUTE,
  MENU_ITEMS_PIN
} from '@components/dialogsSelectionBase';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import type {DialogsSelectionActions} from '@appManagers/utils/dialogs/dialogsSelectionActions';
import {i18n, LangPackKey} from '@lib/langPack';

type DialogsSelectionAction = keyof DialogsSelectionActions;

/** What the bar's menu offers, in the order the other clients put these actions */
const MENU_ITEMS: DialogsSelectionMenuItem<DialogsSelectionAction>[] = [
  MENU_ITEM_READ,
  {action: 'read', direction: false, icon: 'unread', text: 'MarkAsUnread'},
  ...MENU_ITEMS_PIN,
  ...MENU_ITEMS_MUTE,
  {action: 'archive', direction: true, icon: 'archive', text: 'Archive'},
  {action: 'archive', direction: false, icon: 'unarchive', text: 'Unarchive'},
  MENU_ITEM_DELETE
];

/**
 * Selecting several chats of the chat list at once (`appMessagesManager.getDialogsSelectionActions`
 * decides what they can be done with). Everything about the bar and the selecting itself is
 * `DialogsSelectionBase`; this is what a chat, as opposed to a forum topic, is and can take.
 *
 * Only the chats of the list that is on screen take part, so switching folders ends it.
 */
export default class DialogsSelection extends DialogsSelectionBase<DialogsSelectionAction> {
  protected countLangKey: LangPackKey = 'ChatsSelected';

  constructor(options: DialogsSelectionBaseOptions) {
    super(options);

    // a press on a chat row opens the chat, so the pinned block is dragged in this mode only
    this.reorderInSelection = true;
  }

  protected getMenuItems() {
    return MENU_ITEMS;
  }

  /**
   * Whether a row can take part in the selection. It has to be a chat of its own, in the chat list
   * that is on screen - so a topic, a monoforum thread, a Community's own row, the "All chats" row,
   * a sponsored row, a found message and every row of a picker or a panel are all out.
   */
  public canSelect(element: HTMLElement) {
    return this.isRowOfList(element) &&
      !!element.dataset.peerId &&
      !element.dataset.threadId &&
      !element.dataset.monoforumParentPeerId &&
      !element.dataset.communityDialog &&
      !element.dataset.isAllChats &&
      !element.dataset.mid &&
      element.dataset.sponsored !== 'true';
  }

  protected async updateActions() {
    const peerIds = this.getSelectedPeerIds();
    this.actions = await this.managers.appMessagesManager.getDialogsSelectionActions(peerIds, this.getFilterId());
  }

  /** The selected chats in the order they are in the list, topmost first */
  private getSelectedPeerIds() {
    return this.getOrderedKeys() as PeerId[];
  }

  protected async perform(action: DialogsSelectionAction, direction: boolean) {
    const peerIds = this.getSelectedPeerIds();
    const filterId = this.getFilterId();
    const {appMessagesManager} = this.managers;
    switch(action) {
      case 'read': {
        appMessagesManager.markDialogsUnread({peerIds, read: direction});
        break;
      }

      case 'mute': {
        appMessagesManager.toggleDialogsMute({dialogs: peerIds.map((peerId) => ({peerId})), mute: direction});
        break;
      }

      case 'archive': {
        appMessagesManager.editPeerFolders(peerIds, direction ? FOLDER_ID_ARCHIVE : FOLDER_ID_ALL);
        break;
      }

      case 'pin': {
        appMessagesManager.setDialogsPinned({peerIds, pinned: direction, filterId})
        .catch((err: ApiError) => showPinLimitReached(err, {filterId}));
        break;
      }

      case 'delete': {
        const revokable = await appMessagesManager.getDialogsRevokable(peerIds);
        const checked = await this.confirmDeletion({
          titleLangKey: 'DeleteMessagesTitle',
          titleLangArgs: [i18n('Chats', [peerIds.length])],
          descriptionLangKey: 'AreYouSureDeleteFewChats',
          // * the per-chat popup asks about one peer by name; a bulk delete can only offer the
          // * question for the chats where it applies at all, the way Android puts it
          checkboxes: revokable.length ? [{text: 'DeleteMessagesForBothSidesWherePossible'}] : undefined
        });
        if(!checked) {
          return false;
        }

        this.deleteDialogs(peerIds, checked[0] ? new Set(revokable) : undefined);
        break;
      }
    }
  }

  /**
   * Deleting a chat means something different for every kind of peer, and the per-chat popup is
   * what asks about the destructive halves of it. A bulk delete asks one question - whether the
   * private chats that can be deleted for the other side too should be (`revoke`) - and does the
   * plain thing otherwise: a private chat goes from our own side, a group or channel is left.
   */
  private deleteDialogs(peerIds: PeerId[], revoke?: Set<PeerId>) {
    const {appMessagesManager, appChatsManager} = this.managers;
    peerIds.forEach(async(peerId) => {
      if(peerId.isUser()) {
        appMessagesManager.flushHistory({peerId, justClear: false, revoke: revoke?.has(peerId)});
        return;
      }

      leaveChat(peerId, !(await appChatsManager.isChannel(peerId.toChatId())));
    });
  }
}
