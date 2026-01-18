import {AdminLogFilterFlags} from '@appManagers/appChatsManager';

export type CommittedFilters = {
  search?: string;
  flags?: AdminLogFilterFlags;
  admins?: PeerId[];
};
