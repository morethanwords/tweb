/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {Middleware} from '../../helpers/middleware';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {Chat, ChatInvite} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {i18n, _i18n, LangPackKey} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../lib/rootScope';
import {avatarNew, wrapPhotoToAvatar} from '../avatarNew';
import generateTitleIcons from '../generateTitleIcons';
import {toastNew} from '../toast';
import PopupPeer from './peer';

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

export async function wrapChatInviteTitle(
  chatInvite: ChatInvite.chatInvite,
  middleware: Middleware
) {
  const title = document.createElement('div');
  title.classList.add('peer-title', 'chat-title');

  const icons = await generateTitleIcons({
    peerId: NULL_PEER_ID,
    noVerifiedIcon: false,
    noFakeIcon: false,
    noPremiumIcon: false,
    peer: {
      _: 'channel',
      pFlags: {
        verified: chatInvite.pFlags.verified,
        scam: chatInvite.pFlags.scam,
        fake: chatInvite.pFlags.fake
      },
      date: 0,
      id: 0,
      photo: undefined,
      title: ''
    },
    wrapOptions: {
      middleware
    }
  });

  const titleFragment = wrapEmojiText(chatInvite.title);
  if(icons.elements.length || icons.botVerification) {
    title.classList.add('with-icons');
    const titleInner = document.createElement('span');
    titleInner.classList.add('peer-title-inner');
    titleInner.append(titleFragment);
    if(icons.botVerification) titleInner.append(icons.botVerification);
    title.append(titleInner, ...icons.elements);
  } else {
    setInnerHTML(title, titleFragment);
  }

  return title;
}

export async function wrapChatInviteAvatar(chatInvite: ChatInvite.chatInvite, middleware: Middleware, size: number) {
  const avatarElem = avatarNew({
    middleware,
    size,
    isDialog: false,
    isSubscribed: !!chatInvite.subscription_pricing || undefined
  });
  if(chatInvite.photo?._ === 'photo') {
    await wrapPhotoToAvatar(avatarElem, chatInvite.photo);
    if(chatInvite.subscription_pricing) {
      avatarElem.setIsSubscribed(true);
    }
  } else {
    avatarElem.render({
      peerTitle: chatInvite.title
    });
    await avatarElem.readyThumbPromise;
  }

  return avatarElem;
}

export default class PopupJoinChatInvite extends PopupPeer {
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
        callback: () => {
          PopupJoinChatInvite.import(hash);
        }
      }]),
      description: true
    });

    this.construct();
  }

  public static openChat(chatId: ChatId) {
    const peerId = chatId.toPeerId(true);
    appImManager.setInnerPeer({peerId});
  }

  public static import(hash: string) {
    rootScope.managers.appChatInvitesManager.importChatInvite(hash)
    .then((chatId) => {
      this.openChat(chatId);
    }, (error) => {
      if((error as ApiError).type === 'INVITE_REQUEST_SENT') {
        toastNew({langPackKey: 'RequestToJoinSent'});
      }
    });
  }

  public static async open(hash: string, chatInvite: ChatInvite) {
    if(chatInvite._ === 'chatInviteAlready') {
      // load missing chat
      await rootScope.managers.appChatInvitesManager.checkChatInvite(hash);
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

    const {chatInvite} = this;

    const avatarElem = await wrapChatInviteAvatar(chatInvite, this.middlewareHelper.get(), 100);
    const title = await wrapChatInviteTitle(chatInvite, this.middlewareHelper.get());
    // avatarElem.setAttribute('peer', '' + -fakeChat.id);

    if(chatInvite.about) {
      this.description.replaceChildren(wrapEmojiText(chatInvite.about));
    } else {
      this.description.remove();
      this.description = undefined;
    }

    const isBroadcast = chatInvite.pFlags.broadcast;
    const peopleCount = i18n(isBroadcast ? 'Subscribers' : 'Members', [numberThousandSplitter(chatInvite.participants_count)]);
    peopleCount.classList.add('chat-participants-count');

    this.body.append(...[avatarElem.node, title, peopleCount, this.description].filter(Boolean));

    if(chatInvite.pFlags.request_needed) {
      const caption = document.createElement('div');
      _i18n(caption, isBroadcast ? 'RequestToJoinChannelDescription' : 'RequestToJoinGroupDescription');
      caption.classList.add('chat-participants-count', 'request-caption');

      this.body.append(caption);
    }

    this.show();
  }
}
