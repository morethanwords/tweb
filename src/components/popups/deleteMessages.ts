/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appChatsManager from "../../lib/appManagers/appChatsManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import rootScope from "../../lib/rootScope";
import { addCancelButton, PopupButton } from ".";
import PopupPeer from "./peer";
import { ChatType } from "../chat/chat";
import { i18n, LangPackKey } from "../../lib/langPack";
import PeerTitle from "../peerTitle";

export default class PopupDeleteMessages {
  constructor(peerId: number, mids: number[], type: ChatType, onConfirm?: () => void) {
    const peerTitleElement = new PeerTitle({
      peerId,
      onlyFirstName: true
    }).element;

    mids = mids.slice();
    const callback = (revoke?: true) => {
      onConfirm && onConfirm();
      if(type === 'scheduled') {
        appMessagesManager.deleteScheduledMessages(peerId, mids);
      } else {
        appMessagesManager.deleteMessages(peerId, mids, revoke);
      }
    };

    let title: LangPackKey, titleArgs: any[], description: LangPackKey, descriptionArgs: any[], buttons: PopupButton[];
    if(mids.length === 1) {
      title = 'DeleteSingleMessagesTitle';
    } else {
      title = 'DeleteMessagesTitle';
      titleArgs = [i18n('messages', [mids.length])];
    }
    
    description = mids.length === 1 ? 'AreYouSureDeleteSingleMessage' : 'AreYouSureDeleteFewMessages';

    buttons = [{
      langKey: 'Delete',
      isDanger: true,
      callback: () => callback()
    }];

    if(peerId === rootScope.myId || type === 'scheduled') {
      
    } else {
      if(peerId > 0) {
        buttons.push({
          langKey: 'DeleteMessagesOptionAlso',
          langArgs: [peerTitleElement],
          isDanger: true,
          callback: () => callback(true)
        });
      } else {
        const chat = appChatsManager.getChat(-peerId);

        const hasRights = appChatsManager.hasRights(-peerId, 'delete_messages');
        if(chat._ === 'chat') {
          const canRevoke = hasRights ? mids.slice() : mids.filter(mid => {
            const message = appMessagesManager.getMessageByPeer(peerId, mid);
            return message.fromId === rootScope.myId;
          });

          if(canRevoke.length) {
            if(canRevoke.length === mids.length) {
              buttons.push({
                langKey: 'DeleteForAll',
                isDanger: true,
                callback: () => callback(true)
              });
            } else {
              buttons.push({
                langKey: 'DeleteMessagesOption',
                isDanger: true,
                callback: () => callback(true)
              });

              description = 'DeleteMessagesTextGroup';
              descriptionArgs = [i18n('messages', [canRevoke.length])];
              //description = `You can also delete the ${canRevoke.length} message${canRevoke.length > 1 ? 's' : ''} you sent from the inboxes of other group members by pressing "${buttonText}".`;
            }
          }
        } else {
          buttons[0].callback = () => callback(true);
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
      buttons
    });

    popup.show();
  }
}
