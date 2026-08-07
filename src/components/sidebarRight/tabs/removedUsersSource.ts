import type AppSelectPeers from '@components/appSelectPeers';
import type {ChannelParticipant, ChatParticipant} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import type {AppRemovedUsersTab} from '@components/solidJsTabs/tabs';
import type {createSelectorForTab} from './participantsSelector';

export type RemovedUsersTab = InstanceType<typeof AppRemovedUsersTab>;
export type RemovedUsersSelectorOptions = ConstructorParameters<
  typeof AppSelectPeers
>[0];
export type RemovedUsersSelectorResult = ReturnType<
  typeof createSelectorForTab
>;

export const isRemovedParticipant = (
  participant?: ChannelParticipant | ChatParticipant
): participant is ChannelParticipant.channelParticipantBanned => {
  return participant?._ === 'channelParticipantBanned' &&
    !!participant.pFlags.left;
};

export type RemovedUsersSource = {
  canChangePermissions: boolean,
  caption: LangPackKey,
  createSelector: (
    options: RemovedUsersSelectorOptions
  ) => RemovedUsersSelectorResult,
  openAddParticipant: () => void,
  attachSelectorBehavior: (selector: AppSelectPeers) => void
};
