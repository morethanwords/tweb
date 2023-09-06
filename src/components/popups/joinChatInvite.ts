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
import {avatarNew} from '../avatarNew';
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

    const avatarElem = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 100,
      isDialog: false
    });
    if(chatInvite.photo._ === 'photo') {
      chatInvite.photo = await managers.appPhotosManager.savePhoto(chatInvite.photo);
      await wrapPhoto({
        container: avatarElem.node,
        message: null,
        photo: chatInvite.photo,
        boxHeight: 100,
        boxWidth: 100,
        withoutPreloader: true
      }).then((result) => {
        avatarElem.node.classList.remove('media-container');
        [result.images.thumb, result.images.full].forEach((image) => {
          image.classList.replace('media-photo', 'avatar-photo');
        });

        return result.loadPromises.thumb;
      });
      avatarElem.node.style.width = avatarElem.node.style.height = '';
    } else {
      avatarElem.render({
        peerTitle: chatInvite.title
      });
      await avatarElem.readyThumbPromise;
    }

    const title = document.createElement('div');
    title.classList.add('chat-title');
    setInnerHTML(title, wrapEmojiText(chatInvite.title));
    // avatarElem.setAttribute('peer', '' + -fakeChat.id);

    const isBroadcast = chatInvite.pFlags.broadcast;
    const peopleCount = i18n(isBroadcast ? 'Subscribers' : 'Members', [numberThousandSplitter(chatInvite.participants_count)]);
    peopleCount.classList.add('chat-participants-count');

    this.body.append(avatarElem.node, title, peopleCount);

    if(chatInvite.pFlags.request_needed) {
      const caption = document.createElement('div');
      _i18n(caption, isBroadcast ? 'RequestToJoinChannelDescription' : 'RequestToJoinGroupDescription');
      caption.classList.add('chat-participants-count', 'request-caption');

      this.body.append(caption);
    }

    this.show();
  }
}
