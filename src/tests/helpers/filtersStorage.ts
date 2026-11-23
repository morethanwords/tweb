import FiltersStorage from '@lib/storages/filters';

/**
 * A FiltersStorage with no folders, worn rather than built: the managers it reads around its folders are stubbed,
 * the server (`apiManager`) and what else a test needs are the test's own
 */
export default function makeFiltersStorage(): any {
  const storage: any = new FiltersStorage();
  storage.dialogsStorage = {getPinnedOrders: (): PeerId[] => []};
  storage.clear(true);
  storage.rootScope = {dispatchEvent: vi.fn()};
  storage.appStateManager = {pushToState: vi.fn()};
  storage.appPeersManager = {getPeerId: (peer: any) => peer.user_id};
  return storage;
}
