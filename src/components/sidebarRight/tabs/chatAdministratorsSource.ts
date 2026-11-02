import type AppSelectPeers from '@components/appSelectPeers';
import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import showPickUserPopup from '@components/popups/pickUser';
import hasRights from '@appManagers/utils/chats/hasRights';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import type {ChannelParticipant, Chat, ChatFull} from '@layer';
import {toastNew} from '@components/toast';
import tsNow from '@helpers/tsNow';
import type {Middleware} from '@helpers/middleware';
import {createSelectorForParticipants} from './participantsSelector';
import type {
  AdministratorsSelectorOptions,
  AdministratorsSource,
  AdministratorsTab
} from './administratorsSource';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export default async function createChatAdministratorsSource(options: {
  tab: AdministratorsTab,
  chatId: ChatId,
  middleware: Middleware
}): Promise<AdministratorsSource> {
  const {tab, chatId, middleware} = options;
  const peerId = chatId.toPeerId(true);
  const [chat, isBroadcast, chatFull, appConfig] = await Promise.all([
    tab.managers.appChatsManager.getChat(chatId) as Promise<
      Chat.chat | Chat.channel
    >,
    tab.managers.appChatsManager.isBroadcast(chatId),
    tab.managers.appProfileManager.getChatFull(chatId),
    tab.managers.apiManager.getAppConfig()
  ]);

  const getParticipantOrMissing = async(userId: PeerId): Promise<ChannelParticipant> => {
    try {
      return await tab.managers.appProfileManager.getParticipant(chatId, userId) as ChannelParticipant;
    } catch(err) {
      if((err as ApiError)?.type !== 'USER_NOT_PARTICIPANT') {
        throw err;
      }

      const isBotUser = await tab.managers.appUsersManager.isBot(userId.toUserId());
      if(!isBroadcast && !isBotUser && !hasRights(chat, 'invite_users')) {
        toastNew({langPackKey: 'Error.RequestPeer.NoRights.Group'});
        return;
      }

      return {
        _: 'channelParticipant',
        user_id: userId.toUserId(),
        date: tsNow(true)
      };
    }
  };

  const canSeeAntiSpam = !isBroadcast &&
    chat.participants_count >= appConfig.telegram_antispam_group_size_min;

  return {
    canAddAdmins: hasRights(chat, 'add_admins'),
    antiSpam: canSeeAntiSpam ? {
      checked: !!(chatFull as ChatFull.channelFull)?.pFlags?.antispam,
      disabled: !hasRights(chat, 'delete_messages'),
      toggle: (checked) => handleChannelsTooMuch(() => {
        return tab.managers.appChatsManager.toggleAntiSpam(chatId, checked);
      })
    } : undefined,
    createSelector: (selectorOptions: AdministratorsSelectorOptions) => {
      return createSelectorForParticipants({
        ...selectorOptions,
        peerId,
        channelParticipantsFilter: (q) => {
          return {_: 'channelParticipantsAdmins', q};
        },
        channelParticipantsUpdateFilter: isParticipantAdmin
      });
    },
    openAddAdmin: (openPermissions) => {
      const isChannel = chat._ === 'channel';
      const popup = showPickUserPopup({
        titleLangKey: 'Administrators',
        peerType: ['channelParticipants'],
        participantsGlobalSearch: isChannel,
        peerId,
        onSelect: async(chosen) => {
          const userId = chosen[0].peerId;
          const participant = popup.selector.participants.get(userId) ||
            await getParticipantOrMissing(userId);
          if(participant) {
            openPermissions(participant);
          }
        },
        placeholder: 'SearchPlaceholder'
      });
    },
    openPermissions: ({participant}) => {
      if(participant) {
        hotReloadGuard.tabs.openUserPermissionsTab(tab.slider, chatId, participant, true);
      }
    },
    attachSelectorBehavior: (selector) => {
      createParticipantContextMenu({
        chatId,
        listenTo: selector.scrollable.container,
        participants: selector.participants,
        slider: tab.slider,
        middleware
      });
    }
  };
}
