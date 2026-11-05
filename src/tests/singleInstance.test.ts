import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

/*
 * Which tab is the main one. A tab writes its instance (`xt_instance`) to localStorage: a t.me link reads which
 * account was active last, and a tab with a worker of its own (no SharedWorker, or `?noSharedWorker=1`) reads whether
 * another one runs - it starts its connections only when it is the active tab or when no other runs, and gives way
 * otherwise. Whether the tab of an instance is still there its Web Lock says, so an instance is written when what it
 * says changes, not every 5 s from every tab; only without Web Locks its time says that, and is kept fresh.
 */

const {store, writes, state} = vi.hoisted(() => ({
  store: {} as Record<string, any>,
  writes: [] as any[],
  state: {idle: true, account: 1}
}));

// * keyed as LocalStorage keys them: a tab on the test servers has records of its own
vi.mock('@lib/sessionStorage', async() => {
  const {default: Modes} = await import('@config/modes');
  const prefix = Modes.test ? 't_' : '';
  return {
    default: {
      get: (key: string) => store[prefix + key] && JSON.parse(store[prefix + key]),
      set: async(values: Record<string, any>) => {
        for(const key in values) {
          if(key === 'xt_instance') writes.push(values[key]);
          store[prefix + key] = JSON.stringify(values[key]);
        }
      },
      delete: async(key: string) => {
        delete store[prefix + key];
      }
    }
  };
});
vi.mock('@lib/apiManagerProxy', () => ({default: {setInterval: vi.fn(), toggleStorages: vi.fn()}}));
vi.mock('@helpers/idleController', () => ({default: {get isIdle() { return state.idle; }, addEventListener: vi.fn()}}));
vi.mock('@lib/accounts/getCurrentAccount', () => ({getCurrentAccount: () => state.account}));
vi.mock('@lib/rootScope', () => ({default: {managers: {all: {networkerFactory: {startAll: vi.fn(), stopAll: vi.fn()}}}}}));

import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import findAndSpliceAll from '@helpers/array/findAndSpliceAll';

type Tab = import('@lib/singleInstance').SingleInstance;
type HeldLock = {name: string, mode: LockMode, owner: number};

// * the browser's Web Locks as far as the tabs use them: held until the callback's promise settles, or the tab is gone
const locks = {
  held: [] as HeldLock[],
  owner: 0,
  request(name: string, options: LockOptions, callback: (lock: Lock) => Promise<void>) {
    const lock: HeldLock = {name, mode: options.mode, owner: this.owner};
    this.held.push(lock);
    return Promise.resolve(callback(lock as any as Lock)).finally(() => indexOfAndSplice(this.held, lock));
  },
  async query() {
    return {held: this.held.map(({name, mode}: HeldLock) => ({name, mode})), pending: [] as LockInfo[]};
  },
  close(owner: number) {
    findAndSpliceAll(this.held, (lock) => lock.owner === owner);
  }
};

let lastTabId = 0;
// * every tab has modules of its own, so it is loaded anew, with the kind of worker it was opened with
async function openTab({shared, idle, test = false}: {shared: boolean, idle: boolean, test?: boolean}) {
  vi.resetModules();
  vi.doMock('@environment/sharedWorkerSupport', () => ({default: shared}));
  const {default: Modes} = await import('@config/modes');
  Modes.test = test;
  const {SingleInstance} = await import('@lib/singleInstance');
  const tab = new SingleInstance();
  const id = (tab as any).instanceId = ++lastTabId;
  state.idle = idle;
  locks.owner = id;
  await tab.start();
  return tab;
}

function closeTab(tab: Tab) {
  locks.close((tab as any).instanceId);
}

function check(tab: Tab, idle: boolean, account = 1) {
  state.account = account;
  return (tab as any).checkInstance(idle) as Promise<void>;
}

const isMain = (tab: Tab) => (tab as any).masterInstance as boolean;
const stored = () => JSON.parse(store.xt_instance);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('BroadcastChannel', undefined);
  Object.defineProperty(navigator, 'locks', {value: locks, configurable: true});
  for(const key in store) delete store[key];
  writes.length = 0;
  locks.held.length = 0;
  state.account = 1;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (navigator as any).locks;
  vi.doUnmock('@environment/sharedWorkerSupport');
});

describe.each([
  ['side by side, with a SharedWorker', true],
  ['with a worker of its own', false]
])('a tab alone, %s', (_, shared) => {
  test('writes its instance once while nothing changes, not on every tick', async() => {
    const tab = await openTab({shared, idle: true});
    for(let i = 0; i < 20; ++i) {
      vi.advanceTimersByTime(5000);
      await check(tab, true);
    }

    expect(writes.length).toBe(1);
    expect(stored()).toMatchObject({id: (tab as any).instanceId, idle: true, accountNumber: 1});
    expect(isMain(tab)).toBe(!shared);
  });

  test('writes it again when it goes idle or comes back, when its account changes, and when it is gone', async() => {
    const tab = await openTab({shared, idle: true});
    await check(tab, false);
    await check(tab, false);
    expect(stored()).toMatchObject({idle: false});
    await check(tab, true);
    await check(tab, true, 2);
    expect(stored()).toMatchObject({idle: true, accountNumber: 2});
    delete store.xt_instance;
    await check(tab, true, 2);
    await check(tab, true, 2);
    expect(writes.length).toBe(5);
  });
});

describe('tabs side by side, with a SharedWorker', () => {
  test('one in the background never takes the place of the active one\'s instance, the one the user comes to does', async() => {
    const active = await openTab({shared: true, idle: false});
    const background = await openTab({shared: true, idle: true});
    for(let i = 0; i < 6; ++i) {
      await check(background, true, 2);
      await check(active, false, 1);
    }

    expect(stored()).toMatchObject({accountNumber: 1});
    expect(writes.length).toBe(1);

    await check(background, false, 2);
    await check(active, true, 1);
    expect(stored()).toMatchObject({accountNumber: 2});
  });
});

describe('tabs with a worker of their own', () => {
  test('one in the background leaves the main one be however long since it wrote, and takes its place once it is closed', async() => {
    const main = await openTab({shared: false, idle: false});
    const background = await openTab({shared: false, idle: true});
    for(let i = 0; i < 12; ++i) {
      vi.advanceTimersByTime(5000);
      await check(main, true);
      await check(background, true);
      expect(isMain(main)).toBe(true);
      expect(isMain(background)).toBe(false);
    }

    closeTab(main);
    await check(background, true);
    expect(isMain(background)).toBe(true);
    expect(stored()).toMatchObject({id: (background as any).instanceId});
  });

  test('the one the user comes to becomes the main one, and the one left in the background gives way', async() => {
    const left = await openTab({shared: false, idle: false});
    const other = await openTab({shared: false, idle: true});
    await check(other, false);
    await check(left, true);
    expect(isMain(other)).toBe(true);
    expect(isMain(left)).toBe(false);

    vi.advanceTimersByTime(30000);
    expect(left.deactivatedReason).toBe('tabs');
  });
});

describe('a tab with a worker of its own next to tabs side by side', () => {
  test('gives way once it is in the background and stays out while they are open, however long since they wrote', async() => {
    const sideBySide = await openTab({shared: true, idle: true});
    const own = await openTab({shared: false, idle: false});
    expect(isMain(own)).toBe(true);

    // * the user goes to another window: the tabs side by side run, so this one stops
    await check(own, true);
    expect(isMain(own)).toBe(false);

    for(let i = 0; i < 12; ++i) {
      vi.advanceTimersByTime(5000);
      await check(sideBySide, i % 2 === 0);
      await check(own, true);
      expect(isMain(own)).toBe(false);
    }

    expect(own.deactivatedReason).toBe('tabs');
  });

  test('takes over in the background once they are closed, or deactivated', async() => {
    const sideBySide = await openTab({shared: true, idle: true});
    const own = await openTab({shared: false, idle: true});
    expect(isMain(own)).toBe(false);
    closeTab(sideBySide);
    await check(own, true);
    expect(isMain(own)).toBe(true);

    const sideBySide2 = await openTab({shared: true, idle: true});
    await check(own, true);
    expect(isMain(own)).toBe(false);
    // * Web A opened: the tabs side by side stop, and do not keep this one out any more
    (sideBySide2 as any).onOtherClient();
    expect(sideBySide2.deactivatedReason).toBe('otherClient');
    await vi.advanceTimersByTimeAsync(0);
    await check(own, true);
    expect(isMain(own)).toBe(true);
  });
});

describe('tabs on the test servers', () => {
  test('choose their main one apart from the others', async() => {
    await openTab({shared: true, idle: true});
    await openTab({shared: false, idle: false});
    const test = await openTab({shared: false, idle: true, test: true});
    for(let i = 0; i < 12; ++i) {
      vi.advanceTimersByTime(5000);
      await check(test, true);
      expect(isMain(test)).toBe(true);
    }

    const test2 = await openTab({shared: false, idle: true, test: true});
    await check(test2, true);
    expect(isMain(test2)).toBe(false);
  });
});

describe('without Web Locks', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {value: undefined, configurable: true});
  });

  test('a tab keeps the time in its instance fresh on every tick, and one in the background takes over 20 s after it stopped', async() => {
    const main = await openTab({shared: false, idle: false});
    const background = await openTab({shared: false, idle: true});
    for(let i = 0; i < 6; ++i) {
      vi.advanceTimersByTime(5000);
      await check(main, true);
      await check(background, true);
    }

    expect(writes.length).toBe(7);
    expect(isMain(background)).toBe(false);

    // * closed: nothing writes any more
    for(let i = 0; i < 5; ++i) {
      vi.advanceTimersByTime(5000);
      await check(background, true);
    }

    expect(isMain(background)).toBe(true);
  });

  test('tabs side by side write on every tick, so a tab with a worker of its own in the background gives way', async() => {
    const sideBySide = await openTab({shared: true, idle: true});
    const own = await openTab({shared: false, idle: false});
    await check(own, true);
    await check(sideBySide, true);
    await check(own, true);
    expect(isMain(own)).toBe(false);
    expect(writes.length).toBe(4);
  });
});
