/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../../lib/rootScope";
import PopupElement, { addCancelButton } from ".";
import PopupPeer, { PopupPeerButtonCallbackCheckboxes, PopupPeerOptions } from "./peer";
import { ChatType } from "../chat/chat";
import { i18n, LangPackKey } from "../../lib/langPack";
import PeerTitle from "../peerTitle";

export default class PopupDeleteMessages {
  constructor(peerId: PeerId, mids: number[], type: ChatType, onConfirm?: () => void) {
    const peerTitleElement = new PeerTitle({peerId}).element;

    const managers = PopupElement.MANAGERS;

    mids = mids.slice();
    const callback = (checked: PopupPeerButtonCallbackCheckboxes, revoke?: boolean) => {
      onConfirm && onConfirm();
      if(type === 'scheduled') {
        managers.appMessagesManager.deleteScheduledMessages(peerId, mids);
      } else {
        managers.appMessagesManager.deleteMessages(peerId, mids, !!checked.size || revoke);
      }
    };

    let title: LangPackKey, titleArgs: any[], description: LangPackKey, descriptionArgs: any[], buttons: PopupPeerOptions['buttons'], checkboxes: PopupPeerOptions['checkboxes'] = [];
    if(mids.length === 1) {
      title = 'DeleteSingleMessagesTitle';
    } else {
      title = 'DeleteMessagesTitle';
      titleArgs = [i18n('messages', [mids.length])];
    }
    
    if(managers.appPeersManager.isMegagroup(peerId)) {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessageMega' : 'AreYouSureDeleteFewMessagesMega';
    } else {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessage' : 'AreYouSureDeleteFewMessages';
    }

    buttons = [{
      langKey: 'Delete',
      isDanger: true,
      callback
    }];

    if(peerId === rootScope.myId || type === 'scheduled') {
      
    } else {
      if(peerId.isUser()) {
        checkboxes.push({
          text: 'DeleteMessagesOptionAlso',
          textArgs: [peerTitleElement]
        });
      } else {
        const chat = managers.appChatsManager.getChat(peerId.toChatId());

        const hasRights = managers.appChatsManager.hasRights(peerId.toChatId(), 'delete_messages');
        if(chat._ === 'chat') {
          const canRevoke = hasRights ? mids.slice() : mids.filter(mid => {
            const message = managers.appMessagesManager.getMessageByPeer(peerId, mid);
            return message.fromId === rootScope.myId;
          });

          if(canRevoke.length) {
            if(canRevoke.length === mids.length) {
              checkboxes.push({
                text: 'DeleteForAll'
              });
            } else {
              checkboxes.push({
                text: 'DeleteMessagesOption'
              });

              description = 'DeleteMessagesTextGroup';
              descriptionArgs = [i18n('messages', [canRevoke.length])];
              //description = `You can also delete the ${canRevoke.length} message${canRevoke.length > 1 ? 's' : ''} you sent from the inboxes of other group members by pressing "${buttonText}".`;
            }
          }
        } else {
          buttons[0].callback = (checked) => callback(checked, true);
        }
      }
    }

    addCancelButton(buttons);

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      titleLangKey: title,
      titleLangArgs: titleArgs,
      descriptionLangKey: description,
      descriptionLangArgs: descriptionArgs,
      buttons,
      checkboxes
    });

    popup.show();
  }
}
