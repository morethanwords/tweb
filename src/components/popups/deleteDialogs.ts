/*
 * Multi-chat bulk delete popup
 */

import PopupElement from '.';
import PopupPeer from '@components/popups/peer';
import type {PopupPeerButtonCallbackCheckboxes} from '@components/popups/peer';

export default class PopupDeleteDialogs {
  constructor(
    private peerIds: PeerId[],
    private onDeleted?: () => void
  ) {
    this.construct();
  }

  private async construct() {
    const {peerIds, onDeleted} = this;
    const count = peerIds.length;
    const managers = PopupElement.MANAGERS;

    const hasUserChats = peerIds.some(p => p.isUser());

    const doDelete = async(_e: MouseEvent, checked: PopupPeerButtonCallbackCheckboxes) => {
      const revokeForUsers = checked?.size > 0;
      await Promise.all(
        peerIds.map((peerId) => {
          const revoke = revokeForUsers && peerId.isUser();
          return managers.appMessagesManager.flushHistory({peerId, justClear: false, revoke})
          .catch(() => {
            // If flushHistory fails (e.g. group/channel), try leaving
            return managers.appChatsManager.leave(peerId.toChatId()).catch(() => {});
          });
        })
      );
      onDeleted?.();
    };

    PopupElement.createPopup(PopupPeer, 'popup-delete-chat', {
      titleLangKey: 'DeleteChats',
      titleLangArgs: [count],
      descriptionLangKey: 'AreYouSureDeleteSelectedChats',
      descriptionLangArgs: [count],
      buttons: [{
        langKey: 'Delete',
        isDanger: true,
        callback: doDelete
      }],
      checkboxes: hasUserChats ? [{text: 'DeleteMessagesOptionAlsoForContacts'}] : undefined
    }).show();
  }
}
