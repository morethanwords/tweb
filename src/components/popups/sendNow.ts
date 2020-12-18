import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { PopupButton } from ".";
import PopupPeer from "./peer";

export default class PopupSendNow {
  constructor(peerId: number, mids: number[], onConfirm?: () => void) {
    let title: string, description: string, buttons: PopupButton[] = [];

    title = `Send Message${mids.length > 1 ? 's' : ''} Now`;
    description = mids.length > 1 ? 'Send ' + mids.length + ' messages now?' : 'Send message now?';

    const callback = () => {
      onConfirm && onConfirm();
      appMessagesManager.sendScheduledMessages(peerId, mids);
    };

    buttons.push({
      text: 'SEND',
      callback
    });

    buttons.push({
      text: 'CANCEL',
      isCancel: true
    });

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      title,
      description,
      buttons
    });

    popup.show();
  }
}