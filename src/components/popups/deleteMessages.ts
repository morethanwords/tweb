/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '@lib/rootScope';
import PopupElement, {addCancelButton} from '.';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerOptions} from '@components/popups/peer';
import {ChatType} from '@components/chat/chat';
import {i18n, LangPackKey} from '@lib/langPack';
import hasRights from '@appManagers/utils/chats/hasRights';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {Message, MessageMedia} from '@layer';
import {formatFullSentTime} from '@helpers/date';
import tsNow from '@helpers/tsNow';
import PopupDeleteMegagroupMessages from '@components/popups/deleteMegagroupMessages';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import namedPromises from '@helpers/namedPromises';

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

    const {peerTitleElement, isBot, messages} = await namedPromises({
      peerTitleElement: wrapPeerTitle({peerId, threadId, onlyFirstName: true}),
      isBot: managers.appPeersManager.isBot(peerId),
      messages: Promise.all(mids.map((mid) => managers.appMessagesManager.getMessageByPeer(peerId, mid)))
    });

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

    const callback = (
      e: MouseEvent,
      checked: PopupPeerButtonCallbackCheckboxes,
      revoke?: boolean
    ) => {
      onConfirm?.();
      if(type === ChatType.Scheduled) {
        managers.appMessagesManager.deleteScheduledMessages(peerId, mids);
      } else {
        const needRevoke = !!checked.size || revoke;
        if(peerId.isUser() && needRevoke && canRevoke.length !== mids.length) {
          managers.appMessagesManager.deleteMessages(peerId, canRevoke, true);
          managers.appMessagesManager.deleteMessages(peerId, mids.filter((mid) => !canRevoke.includes(mid)), false);
        } else {
          managers.appMessagesManager.deleteMessages(peerId, mids, needRevoke);
        }
      }
    };

    const buttons: PopupPeerOptions['buttons'] = [{
      langKey: 'Delete',
      isDanger: true,
      callback
    }];
    const checkboxes: PopupPeerOptions['checkboxes'] = [];
    let title: LangPackKey, titleArgs: any[], description: LangPackKey, descriptionArgs: any[];
    const isSingleMessage = mids.length === 1;
    if(isSingleMessage) {
      title = 'DeleteSingleMessagesTitle';
    } else {
      title = 'DeleteMessagesTitle';
      titleArgs = [i18n('messages', [mids.length])];
    }

    if(isMegagroup) {
      description = isSingleMessage ? 'AreYouSureDeleteSingleMessageMega' : 'AreYouSureDeleteFewMessagesMega';
    } else if(isBot) {
      description = isSingleMessage ? 'AreYouSureDeleteSingleMessageBot' : 'AreYouSureDeleteFewMessagesBot';
    } else {
      description = isSingleMessage ? 'AreYouSureDeleteSingleMessage' : 'AreYouSureDeleteFewMessages';
    }

    let canRevoke: number[] = mids.slice();
    if(peerId === rootScope.myId || type === ChatType.Scheduled || isBot) {

    } else if(peerId.isUser()) {
      canRevoke = canRevoke.filter((mid, idx) => {
        const message = messages[idx];
        const media = (message as Message.message).media;
        if(media?._ === 'messageMediaDice') {
          return false;
        }

        return true;
      });

      if(canRevoke.length === mids.length) {
        checkboxes.push({
          text: 'DeleteMessagesOptionAlso',
          textArgs: [peerTitleElement]
        });
      } else {
        description = isSingleMessage ? 'AreYouSureDeleteSingleMessageOnlyMe' : 'AreYouSureDeleteFewMessagesOnlyMe';

        if(canRevoke.length) {
          checkboxes.push({
            text: 'DeleteMessagesOption'
          });

          description = 'AreYouSureDeleteFewMessagesMixed';
          descriptionArgs = [peerTitleElement];
        }
      }
    } else {
      const chat = await managers.appChatsManager.getChat(peerId.toChatId());

      const _hasRights = hasRights(chat, 'delete_messages');
      if(chat._ === 'chat') {
        canRevoke = _hasRights ? canRevoke : canRevoke.filter((mid, idx) => {
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
