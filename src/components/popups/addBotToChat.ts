import {Chat, ChatAdminRights, User} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import showPickUserPopup from '@components/popups/pickUser';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import type {AddBotToChatScope} from '@appManagers/utils/bots/getBotAddToChatScope';
import canOpenAdminEditor from '@appManagers/utils/chats/canOpenAdminEditor';
import getAddBotToChatAction from '@appManagers/utils/bots/getAddBotToChatAction';
import getBotAdminRightsForChat from '@appManagers/utils/bots/getBotAdminRightsForChat';
import getBotExistingAdminRights from '@appManagers/utils/bots/getBotExistingAdminRights';
import hasBotAdminRights from '@appManagers/utils/bots/hasBotAdminRights';
import mergeBotAdminRights from '@appManagers/utils/bots/mergeBotAdminRights';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import type {AppManagers} from '@lib/managers';

/**
 * Opens the admin rights editor for the bot in the chat, with `rights` offered: a bot not in the chat yet
 * joins it as an admin once they are saved. `managers` are the opener's, bound to its account session: once
 * that is over, the editor is not opened over the next account
 */
export async function openBotAdminEditor({managers, chat, botId, rights, startParam, sendStartAfterAdmin}: {
  managers: AppManagers,
  chat: Chat.chat | Chat.channel,
  botId: BotId,
  rights: ChatAdminRights,
  startParam?: string,
  sendStartAfterAdmin?: boolean
}) {
  const session = getManagersSession(managers);
  const {participant, missing} = await managers.appProfileManager.getParticipantOrMissing(chat.id, botId.toPeerId(false));
  if(isSessionLeaving(session)) {
    return;
  }

  if(!canOpenAdminEditor(chat, missing)) {
    toastNew({langPackKey: 'Error.RequestPeer.NoRights.Group'});
    return;
  }

  const existingAdminRights = getBotExistingAdminRights(chat, participant);
  const initialAdminRights = mergeBotAdminRights(rights, existingAdminRights);

  hotReloadGuard.tabs.openUserPermissionsTab(hotReloadGuard.appSidebarRight, chat.id, participant, true, {
    initialAdminRights,
    existingAdminRights,
    addingBot: {
      startParam,
      sendStartAfterAdmin,
      existingAdmin: isParticipantAdmin(participant)
    }
  });
  hotReloadGuard.appSidebarRight.toggleSidebar(true);
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
      const managers = bindManagersToSession(rootScope.managers);
      const peerId = chosen[0].peerId;
      const chatId = peerId.toChatId();
      const chat = apiManagerProxy.getChat(chatId) as Chat.chat | Chat.channel;
      const isBroadcast = chat._ === 'channel' && !!chat.pFlags.broadcast;
      const rights = getRights(chat);
      const canAddAsAdmin = hasBotAdminRights(rights) && hasRights(chat, 'add_admins');

      if(canAddAsAdmin) {
        await openBotAdminEditor({
          managers,
          chat,
          botId: options.botId,
          rights,
          startParam: options.startParam,
          sendStartAfterAdmin: scope === 'groupAdmin'
        });
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
      await managers.appMessagesManager.addBotToChat(
        options.botId,
        chatId,
        options.startParam
      );
      hotReloadGuard.appImManager.setInnerPeer({peerId});
    }
  });
}
