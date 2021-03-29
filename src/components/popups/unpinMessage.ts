import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { addCancelButton, PopupButton } from ".";
import PopupPeer from "./peer";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import rootScope from "../../lib/rootScope";
import { LangPackKey } from "../../lib/langPack";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import PeerTitle from "../peerTitle";

export default class PopupPinMessage {
  constructor(peerId: number, mid: number, unpin?: true, onConfirm?: () => void) {
    let title: LangPackKey, description: string, buttons: PopupButton[] = [];

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

    if(unpin) {
      let buttonText: LangPackKey = 'UnpinMessage';
      if(!mid) {
        if(canUnpin) {
          title = 'Popup.Unpin.AllTitle';
          description = 'Chat.UnpinAllMessagesConfirmation';
        } else {
          title = 'Popup.Unpin.HideTitle';
          description = 'Popup.Unpin.HideDescription';
          buttonText = 'Popup.Unpin.Hide';
        }
      } else {
        title = 'UnpinMessageAlertTitle';
        description = 'Chat.Confirm.Unpin';
      }
      
      buttons.push({
        langKey: buttonText,
        isDanger: true,
        callback: () => callback()
      });
    } else {
      title = 'PinMessageAlertTitle';
      const pinButtonText: LangPackKey = 'PinMessage';
      
      if(peerId < 0) {
        buttons.push({
          langKey: pinButtonText,
          callback: () => callback()
        });

        if(appChatsManager.isBroadcast(-peerId)) {
          description = 'PinMessageAlertChannel';
        } else {
          description = 'PinMessageAlert';
  
          buttons.push({
            langKey: 'PinNotify',
            callback: () => callback(undefined, true)
          });
        }
      } else {
        description = 'PinMessageAlertChat';

        if(peerId === rootScope.myId) {
          buttons.push({
            langKey: pinButtonText,
            callback: () => callback()
          });
        } else {
          buttons.push({
            langKey: pinButtonText,
            callback: () => callback(true)
          });
  
          buttons.push({
            langKey: 'PinAlsoFor',
            langArgs: [new PeerTitle({peerId, onlyFirstName: true}).element],
            callback: () => callback()
          });
        }
      }
    }

    addCancelButton(buttons);

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      titleLangKey: title,
      descriptionLangKey: description,
      buttons
    });

    popup.show();
  }
}
