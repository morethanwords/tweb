import {Accessor, createMemo, createResource, createSelector, createSignal} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {createSetSignal} from '@helpers/solid/createSetSignal';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {FilterGroupConfigItem, getFilterGroupsConfig} from '@components/sidebarRight/tabs/adminRecentActions/filters/config';
import {CommittedFilters} from '@components/sidebarRight/tabs/adminRecentActions/filters/types';


type UseFlagFiltersArgs = {
  channelId: Accessor<ChatId>;
  isBroadcast: Accessor<boolean>;
};

const adminsFetchLimit = 40; // Have more admins? I'm really sorry :)

export function useFlagFilters({channelId, isBroadcast}: UseFlagFiltersArgs) {
  const {rootScope} = useHotReloadGuard();

  const filterGroupsConfig = createMemo(() => getFilterGroupsConfig({isBroadcast: isBroadcast()}));

  const getAllFlagKeys = () => filterGroupsConfig().flatMap(group => group.items.map(item => item.pFlag));

  const getInitialFlagsStore = () => {
    const keys = getAllFlagKeys();
    return Object.fromEntries(keys.map(key => [key, true]));
  };

  const [adminsResource] = createResource(channelId, (id) =>
    rootScope.managers.appProfileManager.getChannelParticipants({
      id,
      filter: {_: 'channelParticipantsAdmins'},
      offset: 0,
      limit: adminsFetchLimit
    })
  );

  const [search, setSearch] = createSignal('');
  const [selectedFlagsStore, setSelectedFlagsStore] = createStore(getInitialFlagsStore());
  const [selectedAdminIds, setSelectedAdminIds] = createSetSignal<PeerId>();

  const adminIds = createMemo(() =>
    // [...Array.from({length: 20}).flatMap(() => [...adminsResource()?.participants || []])]
    adminsResource()?.participants
    ?.filter(item => 'user_id' in item)
    .map(item => item.user_id) || []
  );

  const notShowingAdmins = createMemo(() => {
    if(!adminsResource()) return null;

    const length = adminIds().length;
    const count = adminsResource().count || length;
    return count - length > 0 ? count - length : null;
  });

  const allAdminPeerIds = createMemo(() =>
    adminIds().map(id => id.toPeerId())
  );

  const isAdminIdSelected = createSelector(
    selectedAdminIds,
    (id: PeerId, ids) => ids.has(id.toPeerId())
  );

  const isFlagSelected = (flag: string) => selectedFlagsStore[flag];

  const flagGroupCheckCount = (group: FilterGroupConfigItem) => {
    return group.items.filter(item => selectedFlagsStore[item.pFlag]).length;
  };

  const onFlagClick = (flag: string) => {
    setSelectedFlagsStore(flag, (prev) => !prev);
  };

  const onFlagGroupClick = (group: FilterGroupConfigItem) => {
    const areAllChecked = group.items.every(item => selectedFlagsStore[item.pFlag]);

    setSelectedFlagsStore(group.items.map(item => item.pFlag), !areAllChecked);
  };

  const onAllAdminsClick = () => {
    const areAllSelected = selectedAdminIds().size === allAdminPeerIds().length;
    setSelectedAdminIds(areAllSelected ? new Set<number> : new Set(allAdminPeerIds()));
  };

  const onAdminClick = (id: PeerId) => {
    const newIds = new Set(selectedAdminIds());
    if(newIds.has(id.toPeerId())) {
      newIds.delete(id.toPeerId());
    } else {
      newIds.add(id.toPeerId());
    }
    setSelectedAdminIds(newIds);
  };

  const getCommittedReady = () => {
    const activeFlagEntries = Object.entries(selectedFlagsStore).filter(([, value]) => value);

    const flags = activeFlagEntries.length && activeFlagEntries.length < getAllFlagKeys().length ?
      Object.fromEntries(activeFlagEntries) :
      undefined;

    const admins = selectedAdminIds().size < allAdminPeerIds().length ?
      Array.from(selectedAdminIds()) :
      undefined;

    if(!search() && !flags && !admins) return null;

    return {
      search: search() || undefined,
      flags,
      admins
    };
  };

  const setFromCommittedFilters = (committedFilters?: CommittedFilters | null) => {
    setSearch(committedFilters?.search || '');
    setSelectedFlagsStore(reconcile(committedFilters?.flags || getInitialFlagsStore()));
    setSelectedAdminIds(new Set(committedFilters?.admins || allAdminPeerIds()));
  };

  return {
    filterGroupsConfig,

    adminIds,
    notShowingAdmins,

    setFromCommittedFilters,
    getCommittedReady,

    search,
    selectedAdminIds,

    onSearchChange: setSearch,
    onFlagClick,
    onFlagGroupClick,
    onAllAdminsClick,
    onAdminClick,

    isFlagSelected,
    isAdminIdSelected,
    flagGroupCheckCount
  };
}
