import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { PopupButton } from ".";
import PopupPeer from "./peer";
import appPeersManager from "../../lib/appManagers/appPeersManager";

export default class PopupPinMessage {
  constructor(peerId: number, mid: number, unpin?: true, onConfirm?: () => void) {
    let title: string, description: string, buttons: PopupButton[] = [];

    const canUnpin = appPeersManager.canPinMessage(peerId);

    const callback = (oneSide?: true, silent?: true) => {
      setTimeout(() => { // * костыль, потому что document.elementFromPoint вернёт popup-peer пока он будет закрываться
        let promise: Promise<any>;
        if(unpin && !mid) {
          if(canUnpin) {
            promise = appMessagesManager.unpinAllMessages(peerId);
          } else {
            promise = appMessagesManager.hidePinnedMessages(peerId);
          }
        } else {
          promise = appMessagesManager.updatePinnedMessage(peerId, mid, unpin, silent, oneSide);
        }

        if(onConfirm) {
          promise.then(onConfirm);
        }
      }, 300);
    };

    const firstName = appPeersManager.getPeerTitle(peerId, false, true);

    if(unpin) {
      let buttonText = 'UNPIN';
      if(!mid) {
        if(canUnpin) {
          title = 'Unpin All Messages?';
          description = 'Would you like to unpin all messages?';
        } else {
          title = 'Hide Pinned Messages?';
          description = 'Do you want to hide the pinned message bar? It wil stay hidden until a new message is pinned.';
          buttonText = 'HIDE';
        }
      } else {
        title = `Unpin Message?`;
        description = 'Would you like to unpin this message?';
      }
      
      buttons.push({
        text: buttonText,
        isDanger: true,
        callback: () => callback()
      });
    } else {
      title = 'Pin Message?';
      
      if(peerId < 0) {
        description = 'Do you want to pin this message for all members in the group?';
        buttons.push({
          text: 'PIN AND NOTIFY',
          callback: () => callback()
        });

        buttons.push({
          text: 'PIN WITHOUT NOTIFYING',
          callback: () => callback(undefined, true)
        });
      } else {
        description = 'Would you like to pin this message?';

        buttons.push({
          text: 'PIN JUST FOR ME',
          callback: () => callback(true)
        });

        buttons.push({
          text: 'PIN FOR ME AND ' + firstName,
          callback: () => callback()
        });
      }
    }

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