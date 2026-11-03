import type {MyDialogFilter} from '@lib/storages/filters';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import pause from '@helpers/schedulers/pause';

const mocks = vi.hoisted(() => {
  type Listener = (payload: any) => unknown;

  const listeners = new Map<string, Listener[]>();
  // * what the worker counts as unread in a folder at the moment it is asked
  const unread = {count: 0};

  // * reads of the worker held back while `holding.on`, until `release` lets them go
  const held: Array<() => void> = [];
  const holding = {on: false};
  const read = async<T>(value: T) => {
    if(holding.on) {
      await new Promise<void>((resolve) => held.push(resolve));
    }

    return value;
  };

  const rootScope = {
    managers: {
      dialogsStorage: {
        getFolderUnreadCount: vi.fn(() => read({
          unreadUnmutedCount: unread.count,
          unreadCount: unread.count,
          unreadMentionsCount: 0
        })),
        getFolder: vi.fn(() => read({dialogs: []}))
      },
      filtersStorage: {
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
    listeners,
    unread,
    held,
    holding,
    rootScope,
    emit(event: string, payload: any) {
      return Promise.all((listeners.get(event) || []).map((listener) => listener(payload)));
    },
    hold() {
      holding.on = true;
    },
    // * one read at a time, in the order they were asked for or the other way round, each with what it set off
    // * run to its end
    async release({lastFirst}: {lastFirst?: boolean} = {}) {
      holding.on = false;
      const resolvers = held.splice(0);
      if(lastFirst) {
        resolvers.reverse();
      }

      for(const resolve of resolvers) {
        resolve();
        await pause(0);
      }
    }
  };
});

vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

async function openStore(filters: MyDialogFilter[]) {
  const useFolders = (await import('@stores/folders')).default;
  const store = useFolders();
  store.setOnClick(() => vi.fn());
  await store.hydrateFilters(filters);
  return store;
}

const folderIds = (store: Awaited<ReturnType<typeof openStore>>) => store.folderItems.map(({id}) => id);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.held.length = 0;
  mocks.holding.on = false;
  mocks.unread.count = 0;
});

describe('folders store recovery', () => {
  it('restores filters after state clear without reloading the tab', async() => {
    const allChats = makeDialogFilter(0, 0);
    const firstFolder = makeDialogFilter(2, 2);
    const secondFolder = makeDialogFilter(3, 3);

    const store = await openStore([allChats, firstFolder, secondFolder]);
    expect(folderIds(store)).toEqual([0, 2, 3]);

    await mocks.emit('filter_delete', firstFolder);
    await mocks.emit('filter_delete', secondFolder);
    expect(folderIds(store)).toEqual([0]);

    await store.hydrateFilters([allChats, firstFolder, secondFolder]);
    expect(folderIds(store)).toEqual([0, 2, 3]);

    await mocks.emit('filter_delete', firstFolder);
    await mocks.emit('filter_delete', secondFolder);
    await mocks.emit('filter_new', firstFolder);
    await mocks.emit('filter_new', secondFolder);

    expect(folderIds(store)).toEqual([0, 2, 3]);
    expect(mocks.listeners.get('filter_new')).toHaveLength(1);
    expect(mocks.listeners.get('filter_delete')).toHaveLength(1);
  });

  it('lets go of the previous account\'s folders at once on a switch, a hydration on its way included', async() => {
    const allChats = makeDialogFilter(0, 0);
    const folder = makeDialogFilter(2, 2);
    const store = await openStore([allChats, folder]);
    store.setSelectedFolderId(2);

    // * the previous account's folders were still being read when the switch came
    const late = store.hydrateFilters([allChats, folder]);
    store.resetForAccountSwitch();
    expect(store.folderItems).toHaveLength(0);
    expect(store.selectedFolderId()).toBe(0);

    await late;
    expect(store.folderItems, 'the previous account\'s folders came back').toHaveLength(0);
  });
});

// * the events of the folders come in bursts, and each tab is read from the worker in between: what comes back
// * has to land on the tabs as they are by then
describe('folders store under a burst of folder events', () => {
  const allChats = makeDialogFilter(0, 0);
  const renamed = (filter: MyDialogFilter, text: string) => ({...filter, title: {...filter.title, text}});

  it('takes a reload that found folders added and removed elsewhere as the worker has it, in its order', async() => {
    const store = await openStore([allChats, makeDialogFilter(2, 2), makeDialogFilter(3, 3)]);

    // * as the worker sends a reload that found folder 3 gone and folder 4 new, put first
    mocks.hold();
    const burst = Promise.all([
      mocks.emit('filter_update', renamed(makeDialogFilter(2, 3), 'Renamed')),
      mocks.emit('filter_update', makeDialogFilter(4, 2)),
      mocks.emit('filter_delete', makeDialogFilter(3, 3)),
      mocks.emit('filter_order', [0, 1, 4, 2])
    ]);
    await mocks.release();
    await burst;

    expect(folderIds(store), 'a tab of a removed folder, or one out of the order').toEqual([0, 4, 2]);
    expect(store.folderItems[2].filter.title.text).toBe('Renamed');
  });

  it('does not bring back a folder removed while it was being read', async() => {
    const store = await openStore([allChats, makeDialogFilter(2, 2)]);

    mocks.hold();
    const added = mocks.emit('filter_new', makeDialogFilter(5, 5));
    void mocks.emit('filter_delete', makeDialogFilter(5, 5));
    await mocks.release();
    await added;

    expect(folderIds(store)).toEqual([0, 2]);
  });

  it('keeps every folder of a burst that adds several', async() => {
    const store = await openStore([allChats, makeDialogFilter(2, 2)]);

    mocks.hold();
    const added = Promise.all([
      mocks.emit('filter_new', makeDialogFilter(4, 4)),
      mocks.emit('filter_new', makeDialogFilter(5, 5))
    ]);
    await mocks.release();
    await added;

    expect(folderIds(store)).toEqual([0, 2, 4, 5]);
  });

  it('shows the latest change of a folder, whichever of its reads comes back first', async() => {
    const folder = makeDialogFilter(2, 2);
    const store = await openStore([allChats, folder]);

    mocks.hold();
    const updated = Promise.all([
      mocks.emit('filter_update', renamed(folder, 'First')),
      mocks.emit('filter_update', renamed(folder, 'Second'))
    ]);
    await mocks.release({lastFirst: true});
    await updated;

    expect(store.folderItems[1].filter.title.text).toBe('Second');
  });

  it('shows a folder\'s latest counts, not ones asked for before its latest change', async() => {
    const folder = makeDialogFilter(2, 2);
    const store = await openStore([allChats, folder]);

    mocks.hold();
    mocks.unread.count = 1;
    void mocks.emit('folder_unread', folder);
    mocks.unread.count = 2;
    const updated = mocks.emit('filter_update', folder);
    await mocks.release({lastFirst: true});
    await updated;

    expect(store.folderItems[1].notifications.count).toBe(2);
  });

  it('lets a hydration neither bring back a folder removed meanwhile nor drop one added meanwhile', async() => {
    const firstFolder = makeDialogFilter(2, 2);
    const secondFolder = makeDialogFilter(3, 3);
    const store = await openStore([allChats, firstFolder, secondFolder]);

    // * the state cleared and loaded again, while the folders change
    mocks.hold();
    const hydration = store.hydrateFilters([allChats, firstFolder, secondFolder]);
    void mocks.emit('filter_delete', secondFolder);
    const added = mocks.emit('filter_new', makeDialogFilter(4, 4));
    await mocks.release({lastFirst: true});
    await Promise.all([hydration, added]);

    expect(folderIds(store)).toEqual([0, 2, 4]);
  });

  it('lets a hydration take away the folders it does not have, but not one changed after it began', async() => {
    const firstFolder = makeDialogFilter(2, 2);
    const secondFolder = makeDialogFilter(3, 3);
    const store = await openStore([allChats, firstFolder, secondFolder]);

    // * one folder was on its way in before the hydration began, another one changed after it did
    mocks.hold();
    const before = mocks.emit('filter_new', makeDialogFilter(5, 5));
    const hydration = store.hydrateFilters([allChats, firstFolder]);
    const after = mocks.emit('filter_update', renamed(secondFolder, 'Still here'));
    await mocks.release({lastFirst: true});
    await Promise.all([before, hydration, after]);

    expect(folderIds(store)).toEqual([0, 2, 3]);
    expect(store.folderItems[2].filter.title.text).toBe('Still here');
  });

  it('never puts a folder of the previous account read across a switch among the next one\'s tabs', async() => {
    const store = await openStore([allChats, makeDialogFilter(2, 2)]);

    mocks.hold();
    const added = mocks.emit('filter_new', makeDialogFilter(5, 5));
    store.resetForAccountSwitch();
    const hydration = store.hydrateFilters([allChats]);
    await mocks.release({lastFirst: true});
    await Promise.all([hydration, added]);

    expect(folderIds(store)).toEqual([0]);
  });
});
