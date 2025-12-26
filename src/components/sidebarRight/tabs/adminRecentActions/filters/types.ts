import {AdminLogFilterFlags} from '../../../../../lib/appManagers/appChatsManager';

export type CommittedFilters = {
  search?: string;
  flags?: AdminLogFilterFlags;
  admins?: PeerId[];
};
