import setInnerHTML from '@helpers/dom/setInnerHTML';
import {Middleware} from '@helpers/middleware';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {Chat, ChatInvite} from '@layer';
import appImManager from '@lib/appImManager';
import {i18n, LangPackKey} from '@lib/langPack';
import {NULL_PEER_ID} from '@appManagers/constants';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {avatarNew, wrapPhotoToAvatar} from '@components/avatarNew';
import {getMiddleware} from '@helpers/middleware';
import {addCancelButton} from '@components/popups/indexTsx';
import generateTitleIcons from '@components/generateTitleIcons';
import {toastNew} from '@components/toast';
import showPeerPopup from '@components/popups/peer';
import MediaHeader from '@components/mediaHeader';

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
  title.classList.add('peer-title');

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

export function openChatFromInvite(chatId: ChatId) {
  const peerId = chatId.toPeerId(true);
  // Use `open` (not `setInnerPeer`) so forums route through `op`, which opens the topics
  // tab in the left sidebar instead of just dropping the user into the chat view.
  appImManager.open({peerId});
}

export function importChatInvite(hash: string, chatTitle?: string) {
  rootScope.managers.appChatInvitesManager.importChatInvite(hash)
  .then((result) => {
    if(typeof(result) === 'object') {
      void appImManager.openJoinChatWebView(result, chatTitle);
      return;
    }

    if(result) {
      openChatFromInvite(result);
    }
  }, (error) => {
    if((error as ApiError).type === 'INVITE_REQUEST_SENT') {
      toastNew({langPackKey: 'RequestToJoinSent'});
    }
  });
}

export async function openChatInvite(hash: string, chatInvite: ChatInvite) {
  if(chatInvite._ === 'chatInviteAlready') {
    // load missing chat
    await rootScope.managers.appChatInvitesManager.checkChatInvite(hash);
    openChatFromInvite(chatInvite.chat.id);
  } else if(chatInvite._ === 'chatInvitePeek') {
    openChatFromInvite(chatInvite.chat.id);
  } else {
    showJoinChatInvitePopup(hash, chatInvite);
  }
}

export default async function showJoinChatInvitePopup(hash: string, chatInvite: ChatInvite.chatInvite) {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();

  const [avatarElem, title] = await Promise.all([
    wrapChatInviteAvatar(chatInvite, middleware, 100),
    wrapChatInviteTitle(chatInvite, middleware)
  ]);

  const isBroadcast = chatInvite.pFlags.broadcast;

  showPeerPopup('popup-join-chat-invite', {
    closable: true,
    noHeader: true,
    body: true,
    buttons: addCancelButton([{
      langKey: getJoinLangKey(chatInvite),
      callback: () => {
        importChatInvite(hash, chatInvite.title);
      }
    }]),
    content: (
      <>
        <MediaHeader>
          <MediaHeader.Sticker size={100} element={avatarElem.node} />
          <MediaHeader.Title>{title}</MediaHeader.Title>
          <MediaHeader.Subtitle color="secondary">
            {i18n(isBroadcast ? 'Subscribers' : 'Members', [numberThousandSplitter(chatInvite.participants_count)])}
          </MediaHeader.Subtitle>
        </MediaHeader>
        {chatInvite.about && (
          <MediaHeader.Subtitle class="popup-join-chat-invite-about">
            {wrapEmojiText(chatInvite.about)}
          </MediaHeader.Subtitle>
        )}
        {chatInvite.pFlags.request_needed && (
          <div class="popup-join-chat-invite-request-caption secondary">
            {i18n(isBroadcast ? 'RequestToJoinChannelDescription' : 'RequestToJoinGroupDescription')}
          </div>
        )}
      </>
    ),
    onCloseAfterTimeout: () => middlewareHelper.destroy()
  });
}
