/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerOptions} from './peer';
import rootScope from '../../lib/rootScope';
import {FormatterArguments, LangPackKey} from '../../lib/langPack';
import wrapPeerTitle from '../wrappers/peerTitle';

export default class PopupPinMessage {
  constructor(private peerId: PeerId, private mid: number, private unpin?: true, private onConfirm?: () => void) {
    this.construct();
  }

  private async construct() {
    const {peerId, mid, unpin, onConfirm} = this;
    let title: LangPackKey, description: LangPackKey, descriptionArgs: FormatterArguments;
    const buttons: PopupPeerOptions['buttons'] = [], checkboxes: PopupPeerOptions['checkboxes'] = [];

    const managers = PopupElement.MANAGERS;

    const canUnpin = await managers.appPeersManager.canPinMessage(peerId);

    const callback = (e: MouseEvent, checked: PopupPeerButtonCallbackCheckboxes, oneSide?: boolean, silent?: boolean) => {
      setTimeout(() => { // * костыль, потому что document.elementFromPoint вернёт popup-peer пока он будет закрываться
        let promise: Promise<any>;
        if(unpin && !mid) {
          if(canUnpin) {
            promise = managers.appMessagesManager.unpinAllMessages(peerId);
          } else {
            promise = managers.appMessagesManager.hidePinnedMessages(peerId);
          }
        } else {
          promise = managers.appMessagesManager.updatePinnedMessage(peerId, mid, unpin, silent, oneSide);
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
          descriptionArgs = ['' + ((await managers.appMessagesManager.getPinnedMessagesCount(peerId)) || 1)];
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

      if(peerId.isAnyChat()) {
        buttons.push({
          langKey: pinButtonText,
          callback: (e, checked) => callback(e, checked, false, !checked.size)
        });

        if(await managers.appChatsManager.isBroadcast(peerId.toChatId())) {
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
            callback: (e, checked) => callback(e, checked, !checked.size)
          });

          checkboxes.push({
            text: 'PinAlsoFor',
            textArgs: [await wrapPeerTitle({peerId})],
            checked: true
          });
        }
      }
    }

    addCancelButton(buttons);

    const popup = PopupElement.createPopup(PopupPeer, 'popup-delete-chat', {
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
