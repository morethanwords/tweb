import type AppSelectPeers from '@components/appSelectPeers';
import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import showPickUserPopup from '@components/popups/pickUser';
import hasRights from '@appManagers/utils/chats/hasRights';
import canOpenAdminEditor from '@appManagers/utils/chats/canOpenAdminEditor';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import type {Chat, ChatFull} from '@layer';
import {toastNew} from '@components/toast';
import type {Middleware} from '@helpers/middleware';
import {createSelectorForParticipants} from './participantsSelector';
import type {
  AdministratorParticipant,
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
      const {managers} = tab;
      // * promoting adds to a channel or a supergroup (channels.editAdmin) whom a global search finds
      // after the members, a bot among them: it cannot join a channel by itself.
      // A basic group promotes only its members (messages.editChatAdmin)
      const searchGlobally = chat._ === 'channel';
      let closed = false;
      const popup = showPickUserPopup({
        titleLangKey: 'Administrators',
        peerType: searchGlobally ? ['channelParticipants', 'custom'] : ['channelParticipants'],
        getMoreCustom: searchGlobally ? async(q) => {
          if(!q) {
            return {result: [], isEnd: true};
          }

          const {my_results, results} = await managers.appUsersManager.searchContacts(q);
          return {
            result: my_results.concat(results).filter((peerId) => peerId.isUser()),
            isEnd: true
          };
        } : undefined,
        // * a member list shows its members, the user among them, by name, as the picker of members alone does
        meAsSaved: false,
        peerId,
        onSelect: async(chosen) => {
          const userId = chosen[0].peerId;
          let participant: AdministratorParticipant = popup.selector.participants.get(userId);
          if(!participant) {
            let missing: boolean;
            let error: ApiError;
            try {
              ({participant, missing} = await managers.appProfileManager.getParticipantOrMissing(chatId, userId));
            } catch(err) {
              error = err as ApiError;
            }

            // * dismissed while the lookup ran, or left for another account (MIDDLEWARE)
            if(closed || !middleware() || error?.type === 'MIDDLEWARE') {
              return;
            }

            if(error) {
              toastNew({langPackKey: 'Error.AnError'});
              return;
            }

            if(!canOpenAdminEditor(chat, missing)) {
              toastNew({langPackKey: 'AddAdminErrorNotAMember'});
              return;
            }
          }

          openPermissions(participant);
        },
        onClose: () => {
          closed = true;
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
