import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { PopupButton } from "./popup";
import PopupPeer from "./popupPeer";

export default class PopupPinMessage {
  constructor(peerID: number, mid: number, unpin?: true) {
    let title: string, description: string, buttons: PopupButton[] = [];

    const callback = () => {
      setTimeout(() => { // * костыль, потому что document.elementFromPoint вернёт popup-peer пока он будет закрываться
        appMessagesManager.updatePinnedMessage(peerID, mid, unpin);
      }, 300);
    };
    if(unpin) {
      title = `Unpin Message?`;
      description = 'Would you like to unpin this message?';
      buttons.push({
        text: 'UNPIN',
        isDanger: true,
        callback
      });
    } else {
      title = 'Pin Message?';
      description = 'Would you like to pin this message?';
      buttons.push({
        text: 'PIN',
        callback
      });
    }

    buttons.push({
      text: 'CANCEL',
      isCancel: true
    });

    const popup = new PopupPeer('popup-delete-chat', {
      peerID,
      title,
      description,
      buttons
    });

    popup.show();
  }
}