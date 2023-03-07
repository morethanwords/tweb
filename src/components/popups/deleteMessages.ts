/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../../lib/rootScope';
import PopupElement, {addCancelButton} from '.';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerOptions} from './peer';
import {ChatType} from '../chat/chat';
import {i18n, LangPackKey} from '../../lib/langPack';
import hasRights from '../../lib/appManagers/utils/chats/hasRights';
import filterAsync from '../../helpers/array/filterAsync';
import wrapPeerTitle from '../wrappers/peerTitle';

export default class PopupDeleteMessages {
  constructor(
    private peerId: PeerId,
    private mids: number[],
    private type: ChatType,
    private onConfirm?: () => void,
    private threadId?: number
  ) {
    this.construct();
  }

  private async construct() {
    let {peerId, mids, type, onConfirm, threadId} = this;

    const peerTitleElement = await wrapPeerTitle({peerId, threadId});

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

    const buttons: PopupPeerOptions['buttons'] = [{
      langKey: 'Delete',
      isDanger: true,
      callback
    }];
    const checkboxes: PopupPeerOptions['checkboxes'] = [];
    let title: LangPackKey, titleArgs: any[], description: LangPackKey, descriptionArgs: any[];
    if(mids.length === 1) {
      title = 'DeleteSingleMessagesTitle';
    } else {
      title = 'DeleteMessagesTitle';
      titleArgs = [i18n('messages', [mids.length])];
    }

    if(await managers.appPeersManager.isMegagroup(peerId)) {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessageMega' : 'AreYouSureDeleteFewMessagesMega';
    } else {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessage' : 'AreYouSureDeleteFewMessages';
    }

    if(peerId === rootScope.myId || type === 'scheduled') {

    } else {
      if(peerId.isUser()) {
        checkboxes.push({
          text: 'DeleteMessagesOptionAlso',
          textArgs: [peerTitleElement]
        });
      } else {
        const chat = await managers.appChatsManager.getChat(peerId.toChatId());

        const _hasRights = hasRights(chat, 'delete_messages');
        if(chat._ === 'chat') {
          const canRevoke = _hasRights ? mids.slice() : await filterAsync(mids, async(mid) => {
            const message = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
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
              // description = `You can also delete the ${canRevoke.length} message${canRevoke.length > 1 ? 's' : ''} you sent from the inboxes of other group members by pressing "${buttonText}".`;
            }
          }
        } else {
          buttons[0].callback = (checked) => callback(checked, true);
        }
      }
    }

    addCancelButton(buttons);

    const popup = PopupElement.createPopup(PopupPeer, 'popup-delete-chat', {
      peerId,
      threadId,
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
