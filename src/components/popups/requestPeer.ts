import {ButtonType, ChatAdminRights, RequestPeerType, Chat as MTChat} from '@layer';
import {ChatRights} from '@appManagers/appChatsManager';
import {BotAdminRight} from '@appManagers/utils/bots/constants';
import getBotExistingAdminRights from '@appManagers/utils/bots/getBotExistingAdminRights';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {i18n, join, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import AppSelectPeers, {SelectSearchPeerType} from '@components/appSelectPeers';
import confirmationPopup from '@components/confirmationPopup';
import {showPickUser2Popup} from '@components/popups/pickUser';
import {resolveAdminRightFlagI18n} from '@components/sidebarRight/tabs/adminRecentActions/adminRightsI18nResolver';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';

const COMMON_CHATS_LIMIT = 100;

// * every right `wanted` names is among the `held` ones
function holdsAdminRights(held: ChatAdminRights, wanted: ChatAdminRights) {
  return !!held && (Object.keys(wanted.pFlags) as BotAdminRight[]).every((right) => !wanted.pFlags[right] || held.pFlags[right]);
}

/**
 * Whether the user can make the bot an admin of `chat` with `rights`, which the server does once the chat is sent
 * to the bot: the owner can grant anything, an admin only with the right to add admins and every right asked for
 */
function canGrantBotAdminRights(chat: MTChat.chat | MTChat.channel, rights: ChatAdminRights) {
  return hasRights(chat, 'add_admins') && (!!chat.pFlags.creator || holdsAdminRights(chat.admin_rights, rights));
}

async function wrapPeerTitles(peerIds: PeerId[]) {
  const titles = join(await Promise.all(peerIds.map((peerId) => wrapPeerTitle({peerId}))), false);
  if(titles.length === 1) {
    return titles[0] as HTMLElement;
  }

  const element = document.createElement('span');
  element.append(...titles);
  return element;
}

// * the names the admin rights editor shows, "Other" last as what is left over
function wrapAdminRights(rights: ChatAdminRights, isBroadcast: boolean) {
  const keys = new Set<LangPackKey>();
  for(const right in rights.pFlags) {
    if(rights.pFlags[right as BotAdminRight]) {
      keys.add(resolveAdminRightFlagI18n(right as BotAdminRight, {isBroadcast}));
    }
  }

  if(keys.delete('AdminRights.Other')) {
    keys.add('AdminRights.Other');
  }

  if(!keys.size) {
    return;
  }

  const element = document.createElement('span');
  element.append(...join([...keys].map((key) => i18n(key)), true));
  return element;
}

/**
 * Asks before chats are sent to the bot. Sending one has the server add the bot to it — as an admin with the
 * rights the bot asked for, or, for a group that has to have the bot in it, as a member — so the question says
 * which chats the bot joins and with which rights. Rejects if the user declines.
 */
export async function showRequestPeerConfirmation({peerType, requestingPeerId, requestedPeerIds, botChatIds}: {
  peerType: RequestPeerType.requestPeerTypeChat | RequestPeerType.requestPeerTypeBroadcast,
  requestingPeerId: PeerId,
  requestedPeerIds: PeerId[],
  /** The chats the bot is known to be in already */
  botChatIds?: ChatId[]
}) {
  type P = Parameters<typeof confirmationPopup>[0];
  const botAdminRights = peerType.bot_admin_rights;
  const isBotParticipant = peerType._ === 'requestPeerTypeChat' && !!peerType.pFlags.bot_participant;
  // * the bot is made an admin of every chat; only to be in a group, it joins the ones it is not in
  const addedPeerIds = botAdminRights ? requestedPeerIds : isBotParticipant ?
    requestedPeerIds.filter((peerId) => !botChatIds?.includes(peerId.toChatId())) :
    [];

  const wrapBotTitle = () => wrapPeerTitle({peerId: requestingPeerId});
  const descriptionLangArgs: P['descriptionLangArgs'] = [
    await wrapPeerTitles(requestedPeerIds),
    await wrapBotTitle()
  ];

  let descriptionLangKey: P['descriptionLangKey'] = 'Chat.Service.PeerRequest.Confirm.Plain';
  if(addedPeerIds.length) {
    descriptionLangArgs.push(await wrapBotTitle(), await wrapPeerTitles(addedPeerIds));
    const rightsElement = botAdminRights && wrapAdminRights(botAdminRights, peerType._ === 'requestPeerTypeBroadcast');
    if(rightsElement) {
      descriptionLangKey = 'Chat.Service.PeerRequest.Confirm.Permission';
      descriptionLangArgs.push(rightsElement);
    } else {
      descriptionLangKey = 'Chat.Service.PeerRequest.Confirm.Add';
    }
  }

  return confirmationPopup({
    descriptionLangKey,
    descriptionLangArgs,
    button: {
      langKey: 'Chat.Service.PeerRequest.Confirm.Ok'
    }
  });
}

// Shows the peer picker described by a `buttonTypeRequestPeer`, applies the
// button's peer-type constraints and (for chats/channels) a confirmation step.
// Resolves with the chosen peer ids; rejects if the user cancels the picker or
// declines the confirmation. The `requestPeerTypeCreateBot` variant is handled
// by the caller — this only covers the user/group/channel selection flow.
export default async function selectRequestPeers({
  button,
  requestingPeerId
}: {
  button: ButtonType.buttonTypeRequestPeer,
  requestingPeerId: PeerId
}): Promise<PeerId[]> {
  const peerType = button.peer_type;

  if(peerType._ === 'requestPeerTypeCreateBot') {
    throw new Error('REQUEST_PEER_CREATE_BOT_UNSUPPORTED');
  }

  const isRequestingUser = peerType._ === 'requestPeerTypeUser';
  const isRequestingChannel = peerType._ === 'requestPeerTypeBroadcast';
  const isRequestingGroup = peerType._ === 'requestPeerTypeChat';

  const managers = bindManagersToSession(rootScope.managers);
  let filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'];
  let commonChatIds: ChatId[];
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
    let hasAllCommonChats = false;
    if(isRequestingGroup) {
      const messagesChats = await managers.appUsersManager.getCommonChats(requestingPeerId, COMMON_CHATS_LIMIT);
      commonChatIds = messagesChats.chats.map((chat) => chat.id);
      hasAllCommonChats = commonChatIds.length < COMMON_CHATS_LIMIT;
    }

    // * a bot that is an admin with those rights already needs no one to grant them, so a chat is left out only
    // * when the bot is known not to hold them (tdlib leaves unchecked what it cannot read). What the bot holds is
    // * read where it can be: where the user is an admin, or in a group the bot is in. A channel's admins are
    // * hidden from its subscribers; a group is known to be without the bot when it is not among their common chats
    const mayBotHoldAdminRights = async(chat: MTChat.chat | MTChat.channel, rights: ChatAdminRights) => {
      if(!hasRights(chat, 'just_admin') && !commonChatIds?.includes(chat.id)) {
        return isRequestingChannel || !hasAllCommonChats;
      }

      try {
        const participant = await managers.appProfileManager.getParticipant(chat.id, requestingPeerId);
        return holdsAdminRights(getBotExistingAdminRights(chat, participant), rights);
      } catch(err) {
        return (err as ApiError)?.type !== 'USER_NOT_PARTICIPANT';
      }
    };

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

      // * sending the chat makes the bot its admin, which only one who can grant those rights may do
      if(peerType.bot_admin_rights && !canGrantBotAdminRights(peer as MTChat.channel, peerType.bot_admin_rights)) {
        return mayBotHoldAdminRights(peer as MTChat.channel, peerType.bot_admin_rights);
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
    await showRequestPeerConfirmation({
      peerType,
      requestingPeerId,
      requestedPeerIds,
      botChatIds: commonChatIds
    });
  }

  return requestedPeerIds;
}
