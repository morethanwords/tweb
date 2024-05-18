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
import wrapPeerTitle from '../wrappers/peerTitle';
import {Message, MessageMedia} from '../../layer';
import {formatFullSentTime} from '../../helpers/date';
import tsNow from '../../helpers/tsNow';
import PopupDeleteMegagroupMessages from './deleteMegagroupMessages';
import getParticipantPeerId from '../../lib/appManagers/utils/chats/getParticipantPeerId';

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

    mids = mids.slice();

    const managers = PopupElement.MANAGERS;
    const peerTitleElement = await wrapPeerTitle({peerId, threadId, onlyFirstName: true});
    const messages = await Promise.all(mids.map((mid) => managers.appMessagesManager.getMessageByPeer(peerId, mid)));

    const isMegagroup = await managers.appPeersManager.isMegagroup(peerId);
    if(isMegagroup && !messages.some((message) => message.pFlags.out)) {
      const participants = await managers.appProfileManager.getParticipants({
        id: peerId.toChatId(),
        filter: {_: 'channelParticipantsAdmins'},
        limit: 100
      });

      const foundAdmin = messages.some((message) => {
        return participants.participants.some((participant) => getParticipantPeerId(participant) === message.fromId);
      });

      if(!foundAdmin) {
        PopupElement.createPopup(PopupDeleteMegagroupMessages, {
          messages,
          onConfirm: this.onConfirm
        });
        return;
      }
    }

    const callback = (e: MouseEvent, checked: PopupPeerButtonCallbackCheckboxes, revoke?: boolean) => {
      onConfirm?.();
      if(type === ChatType.Scheduled) {
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

    if(isMegagroup) {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessageMega' : 'AreYouSureDeleteFewMessagesMega';
    } else {
      description = mids.length === 1 ? 'AreYouSureDeleteSingleMessage' : 'AreYouSureDeleteFewMessages';
    }

    if(peerId === rootScope.myId || type === ChatType.Scheduled) {

    } else if(peerId.isUser()) {
      checkboxes.push({
        text: 'DeleteMessagesOptionAlso',
        textArgs: [peerTitleElement]
      });
    } else {
      const chat = await managers.appChatsManager.getChat(peerId.toChatId());

      const _hasRights = hasRights(chat, 'delete_messages');
      if(chat._ === 'chat') {
        const canRevoke = _hasRights ? mids.slice() : mids.filter((mid, idx) => {
          const message = messages[idx];
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
          }
        }
      } else {
        let foundGiveaway: MessageMedia.messageMediaGiveaway;
        messages.find((message) => {
          return message &&
            (message as Message.message).media?._ === 'messageMediaGiveaway' &&
            !(message as Message.message).fwdFromId &&
            (foundGiveaway = (message as Message.message).media as MessageMedia.messageMediaGiveaway);
        });

        if(foundGiveaway && foundGiveaway.until_date >= tsNow(true)) {
          title = 'BoostingGiveawayDeleteMsgTitle';
          description = 'BoostingGiveawayDeleteMsgText';
          descriptionArgs = [formatFullSentTime(foundGiveaway.until_date, undefined, true)];
        }

        buttons[0].callback = (e, checked) => callback(e, checked, true);
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
