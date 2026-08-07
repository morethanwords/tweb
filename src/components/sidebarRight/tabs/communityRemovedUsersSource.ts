import type AppSelectPeers from '@components/appSelectPeers';
import createCommunityParticipantCandidatesLoader
from '@components/communities/createCommunityParticipantCandidatesLoader';
import createCommunityParticipantsLoader, {
  COMMUNITY_PARTICIPANTS_PAGE_SIZE
}
from '@components/communities/createCommunityParticipantsLoader';
import showPickUserPopup from '@components/popups/pickUser';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import createParticipantContextMenu
from '@helpers/dom/createParticipantContextMenu';
import getParticipantPeerId
from '@appManagers/utils/chats/getParticipantPeerId';
import {
  isParticipantAdmin,
  isParticipantCreator
} from '@appManagers/utils/chats/isParticipantAdmin';
import type {ChannelParticipant} from '@layer';
import type {Middleware} from '@helpers/middleware';
import rootScope from '@lib/rootScope';
import {createSelectorForTab} from './participantsSelector';
import {
  isRemovedParticipant,
  type RemovedUsersSelectorOptions,
  type RemovedUsersSource,
  type RemovedUsersTab
} from './removedUsersSource';

const makeRemovedParticipant = (
  participantId: PeerId
): ChannelParticipant.channelParticipantBanned => ({
  _: 'channelParticipantBanned',
  pFlags: {left: true},
  peer: {
    _: 'peerUser',
    user_id: participantId.toUserId()
  },
  kicked_by: rootScope.myId.toUserId(),
  date: Math.floor(Date.now() / 1000),
  banned_rights: {
    _: 'chatBannedRights',
    pFlags: {view_messages: true},
    until_date: 0
  }
});

export default async function createCommunityRemovedUsersSource(options: {
  tab: RemovedUsersTab,
  communityId: ChatId,
  middleware: Middleware
}): Promise<RemovedUsersSource> {
  const {tab, communityId, middleware} = options;
  const manager = tab.managers.appCommunitiesManager;
  const participantsManager = tab.managers.appProfileManager;
  const canChangePermissions = await manager.hasRights(
    communityId,
    'ban_users'
  );
  let selector: AppSelectPeers;
  let working = false;

  const syncParticipant = async(
    participantId: PeerId,
    participant?: ChannelParticipant
  ) => {
    if(!middleware()) {
      return;
    }
    if(!isRemovedParticipant(participant)) {
      selector.participants.delete(participantId);
      selector.deletePeerId(participantId);
      return;
    }

    const updatedParticipantId = getParticipantPeerId(participant);
    selector.participants.set(updatedParticipantId, participant);
    if(!selector.getElementByKey(updatedParticipantId)) {
      await selector.renderResultsFunc([updatedParticipantId], false);
    }
  };

  const getParticipant = async(participantId: PeerId) => {
    try {
      return await participantsManager.getChannelParticipant(communityId, participantId);
    } catch{
      return;
    }
  };

  const runMutation = async(
    name: 'ban' | 'unban',
    callback: () => Promise<void>
  ) => {
    if(working) {
      return;
    }

    working = true;
    try {
      await callback();
    } catch(error) {
      console.error(`${name} community participant error`, error);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      working = false;
    }
  };

  const banParticipant = (participantId: PeerId) => {
    return runMutation('ban', async() => {
      const participant = await getParticipant(participantId);
      if(isRemovedParticipant(participant)) {
        await syncParticipant(participantId, participant);
        return;
      }
      if(
        isParticipantCreator(participant) ||
        (isParticipantAdmin(participant) &&
          !(participant as ChannelParticipant.channelParticipantAdmin)
          .pFlags.can_edit)
      ) {
        toastNew({langPackKey: 'AddBannedErrorAdmin'});
        return;
      }

      const title = await getPeerTitle({
        peerId: participantId,
        plainText: true,
        onlyFirstName: true
      });
      await manager.toggleParticipantBanned({communityId, participantId});
      const updatedParticipant = await getParticipant(participantId);
      await syncParticipant(
        participantId,
        isRemovedParticipant(updatedParticipant) ?
          updatedParticipant :
          makeRemovedParticipant(participantId)
      );
      toastNew({
        langPackKey: 'Community.Banned',
        langPackArguments: [title]
      });
    });
  };

  const unbanParticipant = (participantId: PeerId) => {
    return runMutation('unban', async() => {
      await manager.toggleParticipantBanned({
        communityId,
        participantId,
        unban: true
      });
      await syncParticipant(participantId);
    });
  };

  return {
    canChangePermissions,
    caption: 'Community.RemovedUsersInfo',
    createSelector: (selectorOptions: RemovedUsersSelectorOptions) => {
      const result = createSelectorForTab({
        ...selectorOptions,
        peerType: ['custom'],
        channelParticipantsUpdatePeerId: communityId.toPeerId(true),
        channelParticipantsUpdateFilter: isRemovedParticipant,
        getMoreCustom: createCommunityParticipantsLoader({
          communityId,
          manager: participantsManager,
          filter: (q) => ({_: 'channelParticipantsKicked', q}),
          onParticipant: (participantId, participant) => {
            selector.participants.set(participantId, participant);
          },
          limit: COMMUNITY_PARTICIPANTS_PAGE_SIZE
        })
      });
      selector = result.selector;
      return result;
    },
    openAddParticipant: () => {
      showPickUserPopup({
        titleLangKey: 'RemovedUsers',
        peerType: ['custom'],
        excludePeerIds: new Set(selector.participants.keys()),
        getMoreCustom: createCommunityParticipantCandidatesLoader({
          communityId,
          manager,
          limit: COMMUNITY_PARTICIPANTS_PAGE_SIZE,
          kind: 'ban'
        }),
        onSelect: (chosen) => banParticipant(chosen[0].peerId),
        placeholder: 'SearchPlaceholder'
      });
    },
    attachSelectorBehavior: (currentSelector) => {
      createParticipantContextMenu({
        listenTo: currentSelector.scrollable.container,
        slider: tab.slider,
        chatId: communityId,
        participants: currentSelector.participants,
        middleware,
        bannedParticipantAdapter: {
          hasRights: () => manager.hasRights(communityId, 'ban_users'),
          unban: unbanParticipant
        }
      });
    }
  };
}
