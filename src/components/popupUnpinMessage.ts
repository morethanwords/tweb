import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { PopupButton } from "./popup";
import PopupPeer from "./popupPeer";

export default class PopupPinMessage {
  constructor(peerID: number, mid: number) {
    let title: string, description: string, buttons: PopupButton[] = [];

    const callback = () => appMessagesManager.updatePinnedMessage(peerID, mid);
    if(mid) {
      title = 'Pin Message?';
      description = 'Would you like to pin this message?';
      buttons.push({
        text: 'PIN',
        callback
      });
    } else {
      title = `Unpin Message?`;
      description = 'Would you like to unpin this message?';
      buttons.push({
        text: 'UNPIN',
        isDanger: true,
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