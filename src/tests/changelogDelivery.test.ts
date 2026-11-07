import 'fake-indexeddb/auto';
import App from '@config/app';
import {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import {IDB} from '@lib/files/idb';
import pause from '@helpers/schedulers/pause';

// * the message about the version the app was updated to: put in the "Telegram" chat once, and the version written
// * as seen only when it is there or has none
describe('the version\'s message', () => {
  const files: Record<string, {status: number, text?: string} | 'offline'> = {};
  // * a manager with only what the message needs, its protected parts set from here
  let manager: any;

  beforeEach(() => {
    for(const key in files) delete files[key];
    vi.stubGlobal('fetch', vi.fn(async(url: string) => {
      const file = files[url];
      if(file === 'offline') {
        throw new TypeError('Failed to fetch');
      }

      const {status, text = ''} = file || {status: 404};
      return {status, ok: status >= 200 && status < 300, text: async() => text};
    }));

    manager = Object.create(ApiUpdatesManager.prototype);
    Object.assign(manager, {
      changelogReady: true,
      changelogVersions: new Set(),
      updatesState: {syncLoading: null},
      appStateManager: {newVersion: '9.9', pushToState: vi.fn()},
      networkerFactory: {language: 'ru'},
      log: Object.assign(() => {}, {warn: vi.fn(), error: vi.fn()}),
      processLocalUpdate: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('comes once, in the app\'s language, and writes the version', async() => {
    files['changelogs/ru_9.9.md'] = {status: 200, text: '🎨 **Новое.** Всё.'};

    await manager.deliverChangelog();
    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).toHaveBeenCalledTimes(1);
    const update = manager.processLocalUpdate.mock.calls[0][0];
    expect(update.message.startsWith(`Telegram Web${App.suffix} обновлён до версии 9.9`)).toBe(true);
    expect(update.type).toBe('local');
    expect(manager.appStateManager.pushToState).toHaveBeenCalledWith('version', '9.9');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('comes in English when the app\'s language has none', async() => {
    files['changelogs/en_9.9.md'] = {status: 200, text: '🎨 **New.** All.'};

    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).toHaveBeenCalledTimes(1);
    expect(manager.processLocalUpdate.mock.calls[0][0].message.startsWith(`Telegram Web${App.suffix} was updated to version 9.9`)).toBe(true);
    expect(manager.appStateManager.pushToState).toHaveBeenCalledWith('version', '9.9');
  });

  test('that could not be fetched leaves the version new, and is asked for again', async() => {
    files['changelogs/ru_9.9.md'] = 'offline';
    files['changelogs/en_9.9.md'] = 'offline';

    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).not.toHaveBeenCalled();
    expect(manager.appStateManager.pushToState).not.toHaveBeenCalled();

    files['changelogs/ru_9.9.md'] = {status: 200, text: '🎨 **Новое.** Всё.'};
    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).toHaveBeenCalledTimes(1);
    expect(manager.appStateManager.pushToState).toHaveBeenCalledWith('version', '9.9');
  });

  test('that came in one language though the other could not be fetched is not shown again', async() => {
    files['changelogs/ru_9.9.md'] = 'offline';
    files['changelogs/en_9.9.md'] = {status: 200, text: '🎨 **New.** All.'};

    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).toHaveBeenCalledTimes(1);
    expect(manager.appStateManager.pushToState).toHaveBeenCalledWith('version', '9.9');
  });

  test('a version without one is seen all the same, and the app\'s page is not taken for one', async() => {
    files['changelogs/ru_9.9.md'] = {status: 200, text: '<!doctype html><html></html>'};

    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).not.toHaveBeenCalled();
    expect(manager.appStateManager.pushToState).toHaveBeenCalledWith('version', '9.9');
  });

  test('waits for the first difference to be asked for, and needs a new version', async() => {
    files['changelogs/ru_9.9.md'] = {status: 200, text: '🎨 **Новое.** Всё.'};
    manager.changelogReady = false;
    await manager.deliverChangelog();
    manager.changelogReady = true;
    manager.appStateManager.newVersion = undefined;
    await manager.deliverChangelog();

    expect(fetch).not.toHaveBeenCalled();

    // * a tab that knows of the version comes later
    manager.appStateManager.newVersion = '9.9';
    await manager.deliverChangelog();

    expect(manager.processLocalUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('a database upgrade an older version holds back', () => {
  // * a connection of another context at `version`, its upgrade adding `store`; it does nothing on versionchange,
  // * as an older version's does
  const openAt = (name: string, version: number, store: string) => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  // * past the 3 s an open used to give up after
  const PAST_THE_OLD_TIMEOUT = 3500;
  const settle = (promise: Promise<unknown>) => {
    const state = {settled: false};
    promise.then(() => state.settled = true, () => state.settled = true);
    return state;
  };

  const defaultHook = IDB.onUpgradeBlocked;
  afterEach(() => {
    IDB.onUpgradeBlocked = defaultHook;
  });

  test('waits for its connection past the 3 s it used to give up after, and asks the older tabs to let go', async() => {
    const name = 'upgrade-blocked-' + Math.random().toString(36).slice(2);
    const older = await openAt(name, 1, 'session');
    const blocked = vi.fn();
    IDB.onUpgradeBlocked = blocked;

    const idb = new IDB({name, version: 2, stores: [{name: 'session'}, {name: 'widgets'}]} as any);
    const opening = Promise.resolve(idb.openDatabase());
    const state = settle(opening);

    await pause(PAST_THE_OLD_TIMEOUT);
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(state.settled).toBe(false);

    // * the older tab reloads
    older.close();
    const db = await opening;
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(['session', 'widgets']);
  }, 15e3);

  test('queued behind another context\'s upgrade, it waits too, though it hears nothing of the block', async() => {
    const name = 'upgrade-queued-' + Math.random().toString(36).slice(2);
    const older = await openAt(name, 1, 'session');
    const blocked = vi.fn();
    IDB.onUpgradeBlocked = blocked;

    // * the worker's request for the upgrade, made first
    const workers = openAt(name, 2, 'widgets');
    await pause(100);

    const idb = new IDB({name, version: 2, stores: [{name: 'session'}, {name: 'widgets'}]} as any);
    const opening = Promise.resolve(idb.openDatabase());
    const state = settle(opening);

    await pause(PAST_THE_OLD_TIMEOUT);
    expect(state.settled).toBe(false);
    expect(blocked).toHaveBeenCalled();

    older.close();
    (await workers).close();
    const db = await opening;
    expect(db.version).toBe(2);
  }, 15e3);

  test('gives up all the same when the storage answers neither the open nor the question of its version', async() => {
    const open = vi.spyOn(indexedDB, 'open').mockReturnValue({} as IDBOpenDBRequest);
    const databases = vi.spyOn(indexedDB, 'databases').mockReturnValue(new Promise(() => {}));
    try {
      const idb = new IDB({name: 'stalled-' + Math.random().toString(36).slice(2), version: 1, stores: [{name: 'session'}]} as any);
      await expect(Promise.resolve(idb.openDatabase())).rejects.toMatchObject({type: 'IDB_CREATE_TIMEOUT'});
    } finally {
      open.mockRestore();
      databases.mockRestore();
    }
  }, 15e3);

  test('by default asks the tabs of older builds to reload, on the channel every version reloads on', async() => {
    const {unversionedMainBroadcastChannelName} = await import('@config/broadcastChannel');
    const listener = new BroadcastChannel(unversionedMainBroadcastChannelName);
    const received = new Promise<any>((resolve) => listener.onmessage = (event) => resolve(event.data));
    defaultHook('any');
    expect(await received).toEqual({eventName: 'reload', payload: {dropFlags: [], olderThan: App.build}});
    listener.close();
  });
});
