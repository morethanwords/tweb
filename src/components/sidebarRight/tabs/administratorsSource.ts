import type AppSelectPeers from '@components/appSelectPeers';
import type {ChannelParticipant, ChatParticipant} from '@layer';
import type {AppChatAdministratorsTab} from '@components/solidJsTabs/tabs';
import type {createSelectorForTab} from '@components/sidebarRight/tabs/participantsSelector';

export type AdministratorParticipant = ChannelParticipant | ChatParticipant;
export type AdministratorsTab = InstanceType<typeof AppChatAdministratorsTab>;
export type AdministratorsSelectorOptions = ConstructorParameters<
  typeof AppSelectPeers
>[0];
export type AdministratorsSelectorResult = ReturnType<
  typeof createSelectorForTab
>;

export type OpenAdministratorPermissionsOptions = {
  participantId: PeerId,
  participant?: AdministratorParticipant,
  onUpdated: (
    participant?: ChannelParticipant
  ) => MaybePromise<void>
};

export type AdministratorsAntiSpam = {
  checked: boolean,
  disabled: boolean,
  toggle: (checked: boolean) => Promise<unknown>
};

export type AdministratorsSource = {
  canAddAdmins: boolean,
  antiSpam?: AdministratorsAntiSpam,
  createSelector: (
    options: AdministratorsSelectorOptions
  ) => AdministratorsSelectorResult,
  openAddAdmin: (
    openPermissions: (
      participantOrPeerId: AdministratorParticipant | PeerId
    ) => void
  ) => void,
  openPermissions: (
    options: OpenAdministratorPermissionsOptions
  ) => void,
  attachSelectorBehavior?: (selector: AppSelectPeers) => void
};
