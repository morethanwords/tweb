/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {ChatInvite} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {i18n, _i18n} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import AvatarElement from '../avatar';
import putPhoto from '../putPhoto';
import {toastNew} from '../toast';
import wrapPhoto from '../wrappers/photo';

// const FAKE_CHAT_ID = Number.MAX_SAFE_INTEGER - 0x1000;

export default class PopupJoinChatInvite extends PopupElement {
  constructor(
    private hash: string,
    private chatInvite: ChatInvite.chatInvite
  ) {
    super('popup-join-chat-invite', {
      closable: true,
      overlayClosable: true,
      body: true,
      buttons: addCancelButton([{
        langKey: chatInvite.pFlags.request_needed ? 'RequestJoin.Button' : (chatInvite.pFlags.broadcast ? 'JoinByPeekChannelTitle' : 'JoinByPeekGroupTitle'),
        callback: () => {
          this.managers.appChatsManager.importChatInvite(hash)
          .then((chatId) => {
            const peerId = chatId.toPeerId(true);
            appImManager.setInnerPeer({peerId});
          }, (error) => {
            if(error.type === 'INVITE_REQUEST_SENT') {
              toastNew({langPackKey: 'RequestToJoinSent'});
            }
          });
        }
      }])
    });

    this.construct();
  }

  private async construct() {
    this.header.remove();
    /* const fakeChat: Chat.channel | Chat.chat = {
      _: chatInvite.pFlags.channel ? 'channel' : 'chat',
      id: FAKE_CHAT_ID,
      title: chatInvite.title,
      photo: chatInvite.photo as any,
      date: Date.now() / 1000 | 0,
      version: 0,
      participants_count: chatInvite.participants_count,
      pFlags: chatInvite.pFlags as any
    };

    appChatsManager.saveApiChat(fakeChat); */

    const {chatInvite, managers, hash} = this;

    const avatarElem = new AvatarElement();
    avatarElem.classList.add('avatar-100');
    avatarElem.isDialog = false;
    if(chatInvite.photo._ === 'photo') {
      chatInvite.photo = await managers.appPhotosManager.savePhoto(chatInvite.photo);
      wrapPhoto({
        container: avatarElem,
        message: null,
        photo: chatInvite.photo,
        boxHeight: 100,
        boxWidth: 100,
        withoutPreloader: true
      });
      avatarElem.style.width = avatarElem.style.height = '';
    } else {
      putPhoto({
        div: avatarElem,
        peerId: NULL_PEER_ID,
        isDialog: false,
        title: chatInvite.title
      });
    }

    const title = document.createElement('div');
    title.classList.add('chat-title');
    setInnerHTML(title, wrapEmojiText(chatInvite.title));
    // avatarElem.setAttribute('peer', '' + -fakeChat.id);

    const isBroadcast = chatInvite.pFlags.broadcast;
    const peopleCount = i18n(isBroadcast ? 'Subscribers' : 'Members', [numberThousandSplitter(chatInvite.participants_count)]);
    peopleCount.classList.add('chat-participants-count');

    this.body.append(avatarElem, title, peopleCount);

    if(chatInvite.pFlags.request_needed) {
      const caption = document.createElement('div');
      _i18n(caption, isBroadcast ? 'RequestToJoinChannelDescription' : 'RequestToJoinGroupDescription');
      caption.classList.add('chat-participants-count', 'request-caption');

      this.body.append(caption);
    }

    this.show();
  }
}
