import type AppSelectPeers from '@components/appSelectPeers';
import isCommunityAdminCandidate
from '@appManagers/utils/communities/isAdminCandidate';
import createCommunityParticipantCandidatesLoader
from '@components/communities/createCommunityParticipantCandidatesLoader';
import createCommunityParticipantsLoader, {
  COMMUNITY_PARTICIPANTS_PAGE_SIZE
}
from '@components/communities/createCommunityParticipantsLoader';
import showPickUserPopup from '@components/popups/pickUser';
import {openCommunityUserPermissionsTab} from '@components/solidJsTabs/tabs';
import type {ChannelParticipant} from '@layer';
import {createSelectorForTab} from './participantsSelector';
import type {
  AdministratorsSelectorOptions,
  AdministratorsSource,
  AdministratorsTab
} from './administratorsSource';

export default async function createCommunityAdministratorsSource(options: {
  tab: AdministratorsTab,
  communityId: ChatId
}): Promise<AdministratorsSource> {
  const {tab, communityId} = options;
  const canAddAdmins = await tab.managers.appCommunitiesManager.hasRights(
    communityId,
    'add_admins'
  );
  let selector: AppSelectPeers;

  return {
    canAddAdmins,
    createSelector: (selectorOptions: AdministratorsSelectorOptions) => {
      const result = createSelectorForTab({
        ...selectorOptions,
        peerType: ['custom'],
        getMoreCustom: createCommunityParticipantsLoader({
          communityId,
          manager: tab.managers.appProfileManager,
          filter: (q) => ({_: 'channelParticipantsAdmins', q}),
          onParticipant: (participantId, participant) => {
            selector.participants.set(participantId, participant);
          },
          limit: COMMUNITY_PARTICIPANTS_PAGE_SIZE
        })
      });
      selector = result.selector;
      return result;
    },
    openAddAdmin: (openPermissions) => {
      showPickUserPopup({
        titleLangKey: 'Administrators',
        peerType: ['custom'],
        exceptSelf: true,
        filterPeerTypeBy: isCommunityAdminCandidate,
        getMoreCustom: createCommunityParticipantCandidatesLoader({
          communityId,
          manager: tab.managers.appCommunitiesManager,
          limit: COMMUNITY_PARTICIPANTS_PAGE_SIZE
        }),
        onSelect: (chosen) => {
          openPermissions(chosen[0].peerId);
        },
        placeholder: 'SearchPlaceholder'
      });
    },
    openPermissions: ({participantId, participant, onUpdated}) => {
      openCommunityUserPermissionsTab(
        tab.slider,
        communityId,
        participantId,
        participant as ChannelParticipant,
        onUpdated
      );
    }
  };
}
