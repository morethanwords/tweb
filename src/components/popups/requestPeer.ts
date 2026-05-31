import {KeyboardButton, RequestPeerType, Chat as MTChat} from '@layer';
import {ChatRights} from '@appManagers/appChatsManager';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {i18n, join} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import AppSelectPeers, {SelectSearchPeerType} from '@components/appSelectPeers';
import confirmationPopup from '@components/confirmationPopup';
import {showPickUser2Popup} from '@components/popups/pickUser';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';

// Shows the peer picker described by a `keyboardButtonRequestPeer`, applies the
// button's peer-type constraints and (for chats/channels) a confirmation step.
// Resolves with the chosen peer ids; rejects if the user cancels the picker or
// declines the confirmation. The `requestPeerTypeCreateBot` variant is handled
// by the caller — this only covers the user/group/channel selection flow.
export default async function selectRequestPeers({
  button,
  requestingPeerId
}: {
  button: KeyboardButton.keyboardButtonRequestPeer,
  requestingPeerId: PeerId
}): Promise<PeerId[]> {
  const peerType = button.peer_type;

  if(peerType._ === 'requestPeerTypeCreateBot') {
    throw new Error('REQUEST_PEER_CREATE_BOT_UNSUPPORTED');
  }

  const isRequestingUser = peerType._ === 'requestPeerTypeUser';
  const isRequestingChannel = peerType._ === 'requestPeerTypeBroadcast';
  const isRequestingGroup = peerType._ === 'requestPeerTypeChat';

  let filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'];
  const _peerType: SelectSearchPeerType[] = ['dialogs'];
  if(isRequestingUser) {
    filterPeerTypeBy = (peer) => {
      if(peer._ !== 'user') {
        return false;
      }

      if(peerType.bot !== undefined && peerType.bot !== !!peer.pFlags.bot) {
        return false;
      }

      if(peerType.premium !== undefined && peerType.premium !== !!peer.pFlags.premium) {
        return false;
      }

      return true;
    };

    _peerType.push('contacts');
  } else {
    let commonChatIds: ChatId[];
    if(isRequestingGroup) {
      const messagesChats = await rootScope.managers.appUsersManager.getCommonChats(requestingPeerId, 100);
      commonChatIds = messagesChats.chats.map((chat) => chat.id);
    }

    filterPeerTypeBy = (peer) => {
      if(peer._ !== 'channel' && (isRequestingChannel ? true : peer._ !== 'chat')) {
        return false;
      }

      if(!!(peer as MTChat.channel).pFlags.broadcast !== isRequestingChannel) {
        return false;
      }

      if(peerType.pFlags.creator && !(peer as MTChat.chat).pFlags.creator) {
        return false;
      }

      if(peerType.has_username !== undefined && !!getPeerActiveUsernames(peer)[0] !== !!peerType.has_username) {
        return false;
      }

      if((peerType as RequestPeerType.requestPeerTypeChat).forum !== undefined &&
        (peerType as RequestPeerType.requestPeerTypeChat).forum !== !!(peer as MTChat.channel).pFlags.forum) {
        return false;
      }

      if(peerType.user_admin_rights) {
        for(const action in peerType.user_admin_rights.pFlags) {
          if(!hasRights(peer as MTChat.channel, action as ChatRights)) {
            return false;
          }
        }
      }

      if((peerType as RequestPeerType.requestPeerTypeChat).pFlags.bot_participant) {
        if(!commonChatIds.includes(peer.id) && !hasRights(peer as MTChat.chat, 'invite_users')) {
          return false;
        }
      }

      return true;
    };
  }

  const requestedPeerIds = await showPickUser2Popup({
    peerType: _peerType,
    filterPeerTypeBy,
    multiSelect: true,
    limit: button.max_quantity,
    limitCallback: () => {
      toastNew({
        langPackKey: 'RequestPeer.MultipleLimit',
        langPackArguments: [
          i18n(
            isRequestingUser ? 'RequestPeer.MultipleLimit.Users' : (isRequestingChannel ? 'RequestPeer.MultipleLimit.Channels' : 'RequestPeer.MultipleLimit.Groups'),
            [button.max_quantity]
          )
        ]
      });
    },
    titleLangKey: isRequestingUser ? 'RequestPeer.Title.Users' : (isRequestingChannel ? 'RequestPeer.Title.Channels' : 'RequestPeer.Title.Groups')
  });

  if(!isRequestingUser) {
    type P = Parameters<typeof confirmationPopup>[0];
    const requestedPeerTitles = await Promise.all(requestedPeerIds.map((peerId) => wrapPeerTitle({peerId})));
    const joinedTitles = join(requestedPeerTitles, false);
    let joinedTitlesElement: HTMLElement;
    if(joinedTitles.length === 1) {
      joinedTitlesElement = joinedTitles[0] as HTMLElement;
    } else {
      joinedTitlesElement = document.createElement('span');
      joinedTitlesElement.append(...joinedTitles);
    }
    const descriptionLangArgs: P['descriptionLangArgs'] = [
      joinedTitlesElement,
      await wrapPeerTitle({peerId: requestingPeerId})
    ];

    const descriptionLangKey: P['descriptionLangKey'] = 'Chat.Service.PeerRequest.Confirm.Plain';

    await confirmationPopup({
      descriptionLangKey,
      descriptionLangArgs,
      button: {
        langKey: 'Chat.Service.PeerRequest.Confirm.Ok'
      }
    });
  }

  return requestedPeerIds;
}
