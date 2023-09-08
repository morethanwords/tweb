/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {Chat, ChatInvite} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {i18n, _i18n, LangPackKey} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../lib/rootScope';
import {avatarNew, wrapPhotoToAvatar} from '../avatarNew';
import {toastNew} from '../toast';

// const FAKE_CHAT_ID = Number.MAX_SAFE_INTEGER - 0x1000;

const getJoinLangKey = (chatInvite: ChatInvite.chatInvite | ChatInvite.chatInvitePeek): LangPackKey => {
  if(chatInvite._ === 'chatInvitePeek') {
    const chat = (chatInvite as ChatInvite.chatInvitePeek).chat as Chat.channel | Chat.chat;
    return (chat as Chat.channel).pFlags.broadcast ? 'JoinByPeekChannelTitle' : 'JoinByPeekGroupTitle';
  }

  if(chatInvite.pFlags.request_needed) {
    return 'RequestJoin.Button';
  }

  if(chatInvite.pFlags.broadcast) {
    return 'JoinByPeekChannelTitle';
  }

  return 'JoinByPeekGroupTitle';
};

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
        langKey: getJoinLangKey(chatInvite),
        callback: () => PopupJoinChatInvite.import(hash)
      }])
    });

    this.construct();
  }

  public static openChat(chatId: ChatId) {
    const peerId = chatId.toPeerId(true);
    appImManager.setInnerPeer({peerId});
  }

  public static import(hash: string) {
    rootScope.managers.appChatsManager.importChatInvite(hash)
    .then((chatId) => {
      this.openChat(chatId);
    }, (error) => {
      if(error.type === 'INVITE_REQUEST_SENT') {
        toastNew({langPackKey: 'RequestToJoinSent'});
      }
    });
  }

  public static async open(hash: string, chatInvite: ChatInvite) {
    if(chatInvite._ === 'chatInviteAlready') {
      // load missing chat
      await rootScope.managers.appChatsManager.checkChatInvite(hash);
      this.openChat(chatInvite.chat.id);
    } else if(chatInvite._ === 'chatInvitePeek') {
      this.openChat(chatInvite.chat.id);
    } else {
      PopupElement.createPopup(PopupJoinChatInvite, hash, chatInvite);
    }
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
      await wrapPhotoToAvatar(avatarElem, chatInvite.photo);
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
