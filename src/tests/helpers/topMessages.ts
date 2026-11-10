import {AppMessagesManager} from '@appManagers/appMessagesManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {createDialogsStorage} from '@/tests/helpers/dialogsStorage';
import {Dialog, MessagesDialogs} from '@layer';
import '@helpers/peerIdPolyfill';

type Options = {
  response: MessagesDialogs,
  /** Fields of the dialogs storage replacing the empty defaults (`dialogsOffsetDate`, `dialogsPaginationOffsets`, …) */
  storageFields?: Record<string, any>,
  /** The communities manager both the storage and the messages manager see */
  communitiesManager?: Record<string, any>,
  getPeerId?: (peer: Dialog.dialog['peer']) => PeerId,
  getInputPeerById?: (peerId: PeerId) => any
};

/**
 * `AppMessagesManager.getTopMessages` over a real dialogs storage with the managers it reads stubbed out.
 * The storage runs its dialog filter for real but keeps the response's dialogs out of itself, so only
 * the request and what the call stores around the dialogs (pinned order, offsets) can be observed.
 */
export function createTopMessagesHarness(options: Options) {
  const communitiesManager = options.communitiesManager ?? {
    getCommunityDialogsCount: () => 0,
    handlePinnedDialogsOrder: vi.fn(),
    sanitizePinnedDialogsOrder: (order: PeerId[]) => order
  };
  const storage = createDialogsStorage({
    appCommunitiesManager: communitiesManager,
    appMessagesManager: {scheduleHandleNewDialogs: vi.fn()},
    appPeersManager: {
      getPeerId: options.getPeerId ?? ((peer: any) => getPeerId(peer)),
      peerId: (1 as UserId).toPeerId(false)
    },
    appStateManager: {pushToState: vi.fn()}
  });
  Object.assign(storage as any, {
    saveDialog: vi.fn(),
    setDialogsLoaded: vi.fn(),
    getFolderDialogs: (): never[] => [],
    ...options.storageFields
  });

  const filterDialogsForStorage = storage.filterDialogsForStorage.bind(storage);
  vi.spyOn(storage, 'filterDialogsForStorage').mockImplementation((dialogs, onPinnedOrder) => {
    const filtered = filterDialogsForStorage(dialogs, onPinnedOrder);
    filtered.length = 0;
    return filtered;
  });

  const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult(options.response)));
  const manager = new AppMessagesManager();
  const log = Object.assign(vi.fn(), {
    bindPrefix: () => log,
    error: vi.fn(),
    warn: vi.fn()
  });
  Object.assign(manager as any, {
    apiManager: {invokeApiSingleProcess},
    appCommunitiesManager: communitiesManager,
    appDraftsManager: {addMissedDialogs: vi.fn(), getDraftsClock: () => 0},
    appNotificationsManager: {getSettingsClock: () => 0},
    appPeersManager: {getInputPeerById: options.getInputPeerById ?? vi.fn()},
    dialogsStorage: storage,
    log,
    middleware: {get: () => () => true},
    rootScope: {dispatchEvent: vi.fn()},
    saveApiResult: vi.fn(),
    timeManager: {getServerTimeOffset: () => 0}
  });

  return {storage, manager, invokeApiSingleProcess, communitiesManager};
}
