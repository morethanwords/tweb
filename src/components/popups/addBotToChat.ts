import {ChannelParticipant, Chat, ChatAdminRights, ChatParticipant, User} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import appImManager from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import appSidebarRight from '@components/sidebarRight';
import confirmationPopup from '@components/confirmationPopup';
import showPickUserPopup from '@components/popups/pickUser';
import {openUserPermissionsTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import type {AddBotToChatScope} from '@appManagers/utils/bots/getBotAddToChatScope';
import canOpenBotAdminEditor from '@appManagers/utils/bots/canOpenBotAdminEditor';
import getAddBotToChatAction from '@appManagers/utils/bots/getAddBotToChatAction';
import getBotAdminRightsForChat from '@appManagers/utils/bots/getBotAdminRightsForChat';
import getBotExistingAdminRights from '@appManagers/utils/bots/getBotExistingAdminRights';
import hasBotAdminRights from '@appManagers/utils/bots/hasBotAdminRights';
import mergeBotAdminRights from '@appManagers/utils/bots/mergeBotAdminRights';
import tsNow from '@helpers/tsNow';

function makeMissingParticipant(
  chat: Chat.chat | Chat.channel,
  botId: BotId
): ChatParticipant.chatParticipant | ChannelParticipant.channelParticipant {
  const date = tsNow(true);
  if(chat._ === 'channel') {
    return {
      _: 'channelParticipant',
      user_id: botId,
      date
    };
  }

  return {
    _: 'chatParticipant',
    user_id: botId,
    inviter_id: rootScope.myId.toUserId(),
    date
  };
}

async function getParticipantOrMissing(chat: Chat.chat | Chat.channel, botId: BotId) {
  try {
    return {
      participant: await rootScope.managers.appProfileManager.getParticipant(chat.id, botId.toPeerId(false)),
      missing: false
    };
  } catch(err) {
    if((err as ApiError)?.type !== 'USER_NOT_PARTICIPANT') {
      throw err;
    }

    return {
      participant: makeMissingParticipant(chat, botId),
      missing: true
    };
  }
}

export default async function showAddBotToChat(options: {
  botId: BotId,
  scope?: AddBotToChatScope,
  startParam?: string,
  requestedRights?: ChatAdminRights
}) {
  const scope = options.scope ?? 'all';
  const [user, userFull] = await Promise.all([
    rootScope.managers.appUsersManager.getUser(options.botId) as Promise<User.user>,
    rootScope.managers.appProfileManager.getProfile(options.botId)
  ]);
  const action = getAddBotToChatAction(user, userFull);
  if(scope === 'all' && !action) {
    return;
  }

  const getRights = (chat: Chat.chat | Chat.channel) => getBotAdminRightsForChat({
    chat,
    userFull,
    scope,
    requestedRights: options.requestedRights
  });

  return showPickUserPopup({
    titleLangKey: scope === 'groupAdmin' ? 'BotChooseGroup' : action?.pickerTitle || 'SelectChat',
    placeholder: 'SelectChat',
    peerType: ['dialogs'],
    filterPeerTypeBy: (peer) => {
      if(peer._ !== 'chat' && peer._ !== 'channel') {
        return false;
      }

      const isBroadcast = peer._ === 'channel' && !!peer.pFlags.broadcast;
      const canAddAsAdmin = hasBotAdminRights(getRights(peer)) && hasRights(peer, 'add_admins');
      if(scope === 'groupAdmin') {
        return !isBroadcast && canAddAsAdmin;
      }

      if(scope === 'channelAdmin') {
        return isBroadcast && canAddAsAdmin;
      }

      if(isBroadcast) {
        return canAddAsAdmin;
      }

      return canAddAsAdmin || (!user.pFlags.bot_nochats && hasRights(peer, 'invite_users'));
    },
    onSelect: async(chosen) => {
      const peerId = chosen[0].peerId;
      const chatId = peerId.toChatId();
      const chat = apiManagerProxy.getChat(chatId) as Chat.chat | Chat.channel;
      const isBroadcast = chat._ === 'channel' && !!chat.pFlags.broadcast;
      const rights = getRights(chat);
      const canAddAsAdmin = hasBotAdminRights(rights) && hasRights(chat, 'add_admins');

      if(canAddAsAdmin) {
        const {participant, missing} = await getParticipantOrMissing(chat, options.botId);
        if(!canOpenBotAdminEditor(chat, missing)) {
          toastNew({langPackKey: 'Error.RequestPeer.NoRights.Group'});
          return;
        }

        const existingAdminRights = getBotExistingAdminRights(chat, participant);
        const initialAdminRights = mergeBotAdminRights(rights, existingAdminRights);

        openUserPermissionsTab(appSidebarRight, chatId, participant, true, {
          initialAdminRights,
          existingAdminRights,
          addingBot: {
            startParam: options.startParam,
            sendStartAfterAdmin: scope === 'groupAdmin',
            existingAdmin: isParticipantAdmin(participant)
          }
        });
        appSidebarRight.toggleSidebar(true);
        return;
      }

      await confirmationPopup({
        titleLangKey: 'AddOneMemberAlertTitle',
        descriptionLangKey: 'AddMembersAlertNamesText',
        descriptionLangArgs: [
          await wrapPeerTitle({peerId: options.botId.toPeerId(false)}),
          await wrapPeerTitle({peerId})
        ],
        button: {
          langKey: 'Add'
        }
      });
      await rootScope.managers.appMessagesManager.addBotToChat(
        options.botId,
        chatId,
        options.startParam
      );
      appImManager.setInnerPeer({peerId});
    }
  });
}
