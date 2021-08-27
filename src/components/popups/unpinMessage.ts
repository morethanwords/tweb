/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { addCancelButton } from ".";
import PopupPeer, { PopupPeerButtonCallbackCheckboxes, PopupPeerOptions } from "./peer";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import rootScope from "../../lib/rootScope";
import { FormatterArguments, LangPackKey } from "../../lib/langPack";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import PeerTitle from "../peerTitle";

export default class PopupPinMessage {
  constructor(peerId: number, mid: number, unpin?: true, onConfirm?: () => void) {
    let title: LangPackKey, description: LangPackKey, descriptionArgs: FormatterArguments, 
      buttons: PopupPeerOptions['buttons'] = [], checkboxes: PopupPeerOptions['checkboxes'] = [];

    const canUnpin = appPeersManager.canPinMessage(peerId);

    const callback = (checked: PopupPeerButtonCallbackCheckboxes, oneSide?: boolean, silent?: boolean) => {
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
          descriptionArgs = ['' + (appMessagesManager.pinnedMessages[peerId]?.count || 1)];
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
        callback
      });
    } else {
      title = 'PinMessageAlertTitle';
      const pinButtonText: LangPackKey = 'PinMessage';
      
      if(peerId < 0) {
        buttons.push({
          langKey: pinButtonText,
          callback: (checked) => callback(checked, false, !checked.size)
        });

        if(appChatsManager.isBroadcast(-peerId)) {
          description = 'PinMessageAlertChannel';
        } else {
          description = 'PinMessageAlert';
  
          checkboxes.push({
            text: 'PinNotify',
            checked: true
          });
        }
      } else {
        description = 'PinMessageAlertChat';

        if(peerId === rootScope.myId) {
          buttons.push({
            langKey: pinButtonText,
            callback
          });
        } else {
          buttons.push({
            langKey: pinButtonText,
            callback: (checked) => callback(checked, !checked.size)
          });

          checkboxes.push({
            text: 'PinAlsoFor',
            textArgs: [new PeerTitle({peerId}).element],
            checked: true
          });
        }
      }
    }

    addCancelButton(buttons);

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      titleLangKey: title,
      descriptionLangKey: description,
      descriptionLangArgs: descriptionArgs,
      buttons,
      checkboxes
    });

    popup.show();
  }
}
