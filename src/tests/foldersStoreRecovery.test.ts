import type {MyDialogFilter} from '@lib/storages/filters';

const mocks = vi.hoisted(() => {
  type Listener = (payload: any) => unknown;

  const filters = new Map<number, MyDialogFilter>();
  const listeners = new Map<string, Listener[]>();

  const rootScope = {
    managers: {
      dialogsStorage: {
        getFolderUnreadCount: vi.fn(async() => ({
          unreadUnmutedCount: 0,
          unreadCount: 0,
          unreadMentionsCount: 0
        })),
        getFolder: vi.fn(async() => ({dialogs: []}))
      },
      filtersStorage: {
        getFilter: vi.fn(async(filterId: number) => filters.get(filterId)),
        isFilterIdAvailable: vi.fn(async() => true)
      }
    },
    addEventListener: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) || [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
    }),
    dispatchEvent: vi.fn()
  };

  return {
    filters,
    listeners,
    rootScope,
    async emit(event: string, payload: any) {
      await Promise.all((listeners.get(event) || []).map((listener) => listener(payload)));
    }
  };
});

vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

function makeFilter(id: number, localId: number): MyDialogFilter {
  return {
    _: 'dialogFilter',
    pFlags: {},
    id,
    title: {_: 'textWithEntities', text: `Folder ${id}`, entities: []},
    pinned_peers: [],
    include_peers: [],
    exclude_peers: [],
    pinnedPeerIds: [],
    includePeerIds: [],
    excludePeerIds: [],
    localId
  } as MyDialogFilter;
}

describe('folders store recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.filters.clear();
    mocks.listeners.clear();
  });

  it('restores filters after state clear without reloading the tab', async() => {
    const allChats = makeFilter(0, 0);
    const firstFolder = makeFilter(2, 2);
    const secondFolder = makeFilter(3, 3);

    for(const filter of [allChats, firstFolder, secondFolder]) {
      mocks.filters.set(filter.id, filter);
    }

    const useFolders = (await import('@stores/folders')).default;
    const store = useFolders();
    const selectFolder = vi.fn();
    store.setOnClick(() => selectFolder);

    await store.hydrateFilters([allChats, firstFolder, secondFolder]);
    expect(store.folderItems.map(({id}) => id)).toEqual([0, 2, 3]);

    await mocks.emit('filter_delete', firstFolder);
    await mocks.emit('filter_delete', secondFolder);
    expect(store.folderItems.map(({id}) => id)).toEqual([0]);

    await store.hydrateFilters([allChats, firstFolder, secondFolder]);
    expect(store.folderItems.map(({id}) => id)).toEqual([0, 2, 3]);

    await mocks.emit('filter_delete', firstFolder);
    await mocks.emit('filter_delete', secondFolder);
    await mocks.emit('filter_new', firstFolder);
    await mocks.emit('filter_new', secondFolder);

    expect(store.folderItems.map(({id}) => id)).toEqual([0, 2, 3]);
    expect(mocks.listeners.get('filter_new')).toHaveLength(1);
    expect(mocks.listeners.get('filter_delete')).toHaveLength(1);
  });
});
