import type AppSelectPeers from '@components/appSelectPeers';
import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';
import showPickUserPopup from '@components/popups/pickUser';
import hasRights from '@appManagers/utils/chats/hasRights';
import type {Chat} from '@layer';
import type {Middleware} from '@helpers/middleware';
import {createSelectorForParticipants} from './participantsSelector';
import {
  isRemovedParticipant,
  type RemovedUsersSelectorOptions,
  type RemovedUsersSource,
  type RemovedUsersTab
} from './removedUsersSource';

export default async function createChatRemovedUsersSource(options: {
  tab: RemovedUsersTab,
  chatId: ChatId,
  middleware: Middleware
}): Promise<RemovedUsersSource> {
  const {tab, chatId, middleware} = options;
  const peerId = chatId.toPeerId(true);
  const [chat, isBroadcast] = await Promise.all([
    tab.managers.appChatsManager.getChat(chatId) as Promise<
      Chat.chat | Chat.channel
    >,
    tab.managers.appChatsManager.isBroadcast(chatId)
  ]);
  let selector: AppSelectPeers;

  return {
    canChangePermissions: hasRights(chat, 'change_permissions'),
    caption: isBroadcast ? 'NoBlockedChannel2' : 'NoBlockedGroup2',
    createSelector: (selectorOptions: RemovedUsersSelectorOptions) => {
      const result = createSelectorForParticipants({
        ...selectorOptions,
        peerId,
        channelParticipantsFilter: (q) => ({
          _: 'channelParticipantsKicked',
          q
        }),
        channelParticipantsUpdatePeerId: peerId,
        channelParticipantsUpdateFilter: isRemovedParticipant
      });
      selector = result.selector;
      return result;
    },
    openAddParticipant: () => {
      const popup = showPickUserPopup({
        titleLangKey: 'RemovedUsers',
        peerType: ['channelParticipants'],
        peerId,
        onSelect: (chosen) => {
          const participant = popup.selector.participants.get(
            chosen[0].peerId
          );
          return tab.managers.appChatsManager.kickFromChat(
            chatId,
            participant
          );
        },
        placeholder: 'SearchPlaceholder'
      });
    },
    attachSelectorBehavior: (currentSelector) => {
      createParticipantContextMenu({
        chatId,
        listenTo: currentSelector.scrollable.container,
        participants: currentSelector.participants,
        slider: tab.slider,
        middleware
      });
    }
  };
}
