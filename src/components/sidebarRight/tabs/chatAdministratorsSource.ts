import type AppSelectPeers from '@components/appSelectPeers';
import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import showPickUserPopup from '@components/popups/pickUser';
import {openUserPermissionsTab} from '@components/solidJsTabs/tabs';
import hasRights from '@appManagers/utils/chats/hasRights';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import type {Chat, ChatFull} from '@layer';
import type {Middleware} from '@helpers/middleware';
import {createSelectorForParticipants} from './participantsSelector';
import type {
  AdministratorsSelectorOptions,
  AdministratorsSource,
  AdministratorsTab
} from './administratorsSource';

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
      const popup = showPickUserPopup({
        titleLangKey: 'Administrators',
        peerType: ['channelParticipants'],
        peerId,
        onSelect: (chosen) => {
          const participant = popup.selector.participants.get(
            chosen[0].peerId
          );
          openPermissions(participant);
        },
        placeholder: 'SearchPlaceholder'
      });
    },
    openPermissions: ({participant}) => {
      if(participant) {
        openUserPermissionsTab(tab.slider, chatId, participant, true);
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
