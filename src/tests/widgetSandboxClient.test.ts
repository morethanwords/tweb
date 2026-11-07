const showPeerPopup = vi.hoisted(() => vi.fn());
const openUrl = vi.hoisted(() => vi.fn());
const widgetsManager = vi.hoisted(() => ({getWidgetStorage: vi.fn(), setWidgetStorage: vi.fn(async() => {})}));
const listeners = vi.hoisted(() => new Map<string, (arg: any) => void>());

vi.mock('@components/popups/peer', () => ({default: showPeerPopup}));
vi.mock('@lib/appImManager', () => ({default: {openUrl}}));
vi.mock('@lib/rootScope', () => ({
  default: {
    addEventListener: (name: string, callback: (arg: any) => void) => listeners.set(name, callback)
  }
}));

import * as mockedAppImManager from '@lib/appImManager';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import type {AppManagers} from '@lib/managers';
import {handleWidgetAction, interceptWidgetActions} from '@lib/widgetSandbox/actions';
import {createMessageWidgetStorage} from '@lib/widgetSandbox/storage';
import {getRememberedWidgetHeight, getWidgetKey, rememberWidgetHeight} from '@lib/widgetSandbox/sizing';
import {getCurrentAccount, setCurrentAccount} from '@lib/accounts/getCurrentAccount';
import type {ActiveAccountNumber} from '@lib/accounts/types';

// the code under test reads the top level from the registry, not from the module mocked above
registerHotReloadGuard({
  appImManager: (mockedAppImManager as any).default
});

const managers = {appWidgetsManager: widgetsManager} as any as AppManagers;


describe('widget actions (docs/sdk-v1.md §5.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('an external link opens only after a confirmation that shows the whole URL', () => {
    const open = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const url = 'https://example.org/a/very/long/path?with=query#and-hash';
    handleWidgetAction({kind: 'openLink', url});

    expect(showPeerPopup).toHaveBeenCalledTimes(1);
    const options = showPeerPopup.mock.calls[0][1];
    const [anchor] = options.descriptionLangArgs as [HTMLAnchorElement];
    expect(anchor.textContent).toBe(url);
    expect(open).not.toHaveBeenCalled();

    // * within the press of Open, while the browser still takes it as the user's doing
    options.buttons[0].callback();
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
    options.onCloseAfterTimeout();
  });

  test('one dialog at a time: links that come while one is open are dropped', () => {
    handleWidgetAction({kind: 'openLink', url: 'https://example.org/1'});
    handleWidgetAction({kind: 'openLink', url: 'https://example.org/2'});
    expect(showPeerPopup).toHaveBeenCalledTimes(1);

    showPeerPopup.mock.calls[0][1].onCloseAfterTimeout();
    handleWidgetAction({kind: 'openLink', url: 'https://example.org/3'});
    expect(showPeerPopup).toHaveBeenCalledTimes(2);
    showPeerPopup.mock.calls[1][1].onCloseAfterTimeout();
  });

  test('a t.me link goes to the app\'s own handling; haptics and ready do nothing on the web', async() => {
    handleWidgetAction({kind: 'openTelegramLink', url: 'https://t.me/durov'});
    handleWidgetAction({kind: 'haptic', haptic: 'impact', value: 'light'});
    handleWidgetAction({kind: 'ready'});
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://t.me/durov'));
    expect(showPeerPopup).not.toHaveBeenCalled();
  });

  test('the sandbox page takes every action instead, until it lets go', () => {
    const seen: string[] = [];
    const stop = interceptWidgetActions((action) => seen.push(action.kind));
    handleWidgetAction({kind: 'openTelegramLink', url: 'https://t.me/durov'});
    stop();
    expect(seen).toEqual(['openTelegramLink']);
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('widget storage of a message (docs/sdk-v1.md §5.4)', () => {
  const account = getCurrentAccount();
  // each test's widgets are made after the clears of the tests before (a binding made before one keeps nothing more)
  let now = Date.now();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now += 60e3);
  });

  afterEach(() => vi.useRealTimers());

  test('preloads both areas; local goes to disk a moment after the last commit, session stays in memory', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue({count: '1'});
    const storage = createMessageWidgetStorage(managers, 5 as PeerId, 10);
    expect(await storage.load()).toEqual({local: {count: '1'}, session: {}});

    storage.commit('local', {count: '2'});
    storage.commit('local', {count: '3'});
    storage.commit('session', {tab: 'b'});
    expect(widgetsManager.setWidgetStorage).not.toHaveBeenCalled();
    // a widget started again before the write sees what it committed
    expect(await storage.load()).toEqual({local: {count: '3'}, session: {tab: 'b'}});

    vi.advanceTimersByTime(1000);
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledTimes(1);
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledWith(5, 10, {count: '3'}, expect.any(Number));
  });

  test('writes at once when the widget hides, and the session area goes with its message', async() => {
    const storage = createMessageWidgetStorage(managers, 6 as PeerId, 11);
    storage.commit('local', {a: '1'});
    storage.commit('session', {b: '2'});
    storage.flush();
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledWith(6, 11, {a: '1'}, expect.any(Number));

    // * the account's worker tells of it
    listeners.get('widget_storage_delete')({accountNumber: account, peerId: 6, mids: [11]});
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    expect(await storage.load()).toEqual({local: {}, session: {}});
  });

  test('messages deleted or cut off while the tab shows another account: what the page keeps of them goes, told once', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const other = (account === 1 ? 2 : 1) as ActiveAccountNumber;
    const channel = -3000 as PeerId, offset = 2 ** 32;
    const privateChat = createMessageWidgetStorage(managers, 20 as PeerId, 70);
    const cutOff = createMessageWidgetStorage(managers, channel, offset + 4);
    const kept = createMessageWidgetStorage(managers, channel, offset + 9);
    for(const storage of [privateChat, cutOff, kept]) storage.commit('session', {b: '1'});
    rememberWidgetHeight(getWidgetKey(account, 20 as PeerId, 70), 100);

    setCurrentAccount(other);
    try {
      // * a private chat's by its id, which is the account's; a channel's history hidden up to a message
      listeners.get('widget_storage_delete')({accountNumber: account, mids: [70]});
      listeners.get('widget_storage_delete')({accountNumber: account, peerId: channel, maxId: 5});
      expect(getRememberedWidgetHeight(getWidgetKey(account, 20 as PeerId, 70))).toBeUndefined();
    } finally {
      setCurrentAccount(account);
    }

    expect((await privateChat.load()).session).toEqual({});
    expect((await cutOff.load()).session).toEqual({});
    expect((await kept.load()).session).toEqual({b: '1'});
    // * the tab's own history_delete, of the account it shows, has nothing of it to do: a deletion is handled once
    expect(listeners.has('history_delete')).toBe(false);
  });

  test('a bubble built again before the write starts its widget from what the last one committed', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue({count: '1'});
    const before = createMessageWidgetStorage(managers, 7 as PeerId, 12);
    before.commit('local', {count: '2'});
    const again = createMessageWidgetStorage(managers, 7 as PeerId, 12);
    expect((await again.load()).local).toEqual({count: '2'});

    // * what the one before commits while the worker answers is newer than the answer (a restart, a replacement)
    let answer: (values: Record<string, string>) => void;
    widgetsManager.getWidgetStorage.mockReturnValueOnce(new Promise((resolve) => answer = resolve));
    const restarted = createMessageWidgetStorage(managers, 7 as PeerId, 13);
    const loading = restarted.load();
    createMessageWidgetStorage(managers, 7 as PeerId, 13).commit('local', {count: '4'});
    answer({count: '3'});
    expect((await loading).local).toEqual({count: '4'});

    // * two of one message: the older one's write, as its timer or its stop comes later, does not undo the newer one's
    const older = createMessageWidgetStorage(managers, 7 as PeerId, 14);
    const newer = createMessageWidgetStorage(managers, 7 as PeerId, 14);
    older.commit('local', {count: '5'});
    newer.commit('local', {count: '6'});
    newer.flush();
    older.flush();
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledTimes(1);
    expect(widgetsManager.setWidgetStorage).toHaveBeenLastCalledWith(7, 14, {count: '6'}, expect.any(Number));
  });

  test('a chat\'s history going takes its session areas and unsaved writes, "Clear cache" all of them', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const gone = createMessageWidgetStorage(managers, 8 as PeerId, 1);
    const kept = createMessageWidgetStorage(managers, 9 as PeerId, 1);
    for(const storage of [gone, kept]) {
      storage.commit('local', {a: '1'});
      storage.commit('session', {b: '2'});
    }

    listeners.get('widget_storage_delete')({accountNumber: account, peerId: 8});
    expect(await gone.load()).toEqual({local: {}, session: {}});
    expect(await kept.load()).toEqual({local: {a: '1'}, session: {b: '2'}});

    listeners.get('widget_storage_delete')({accountNumber: account});
    expect(await kept.load()).toEqual({local: {}, session: {}});

    // a channel's history up to a message: the newer ones keep theirs (widgets started after "Clear cache")
    vi.advanceTimersByTime(1);
    const channel = -2000 as PeerId, offset = 2 ** 32;
    const older = createMessageWidgetStorage(managers, channel, offset + 3);
    const newer = createMessageWidgetStorage(managers, channel, offset + 8);
    // * a message being sent: its temporary id, rounded, falls within, but the server's id comes after
    const sending = createMessageWidgetStorage(managers, channel, offset + 5.0001);
    older.commit('session', {c: '1'});
    newer.commit('session', {c: '2'});
    sending.commit('session', {c: '3'});
    sending.commit('local', {d: '3'});
    listeners.get('widget_storage_delete')({accountNumber: account, peerId: channel, maxId: 5});
    expect((await older.load()).session).toEqual({});
    expect((await newer.load()).session).toEqual({c: '2'});
    expect(await sending.load()).toEqual({local: {d: '3'}, session: {c: '3'}});
  });

  test('what a widget keeps while its message is being sent goes under the id the server gives the message', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const tempMid = 11.0001;
    const sending = createMessageWidgetStorage(managers, 8 as PeerId, tempMid);
    sending.commit('local', {a: '1'});
    sending.commit('session', {b: '2'});
    // not sent yet: it goes to the account's worker under the temporary id, which moves it with the message also when
    // this tab shows another account by then; it stays here too, for the bubble built again under the server's id
    sending.flush();
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledWith(8, tempMid, {a: '1'}, expect.any(Number));
    await widgetsManager.setWidgetStorage.mock.results[0].value;

    listeners.get('widget_storage_remap')({accountNumber: account, peerId: 8, tempId: tempMid, mid: 12});
    // as the widget's own writes go: one made before "Clear cache" writes nothing more
    expect(widgetsManager.setWidgetStorage).toHaveBeenCalledWith(8, 12, {a: '1'}, expect.any(Number));
    const boundAt = (widgetsManager.setWidgetStorage.mock.calls[0] as unknown[])[3];
    // the bubble built again under the server's id starts from it
    const sent = createMessageWidgetStorage(managers, 8 as PeerId, 12);
    expect(await sent.load()).toEqual({local: {a: '1'}, session: {b: '2'}});

    // the widget of the message being sent writes under the server's id from now on
    sending.commit('local', {a: '3'});
    sending.flush();
    expect(widgetsManager.setWidgetStorage).toHaveBeenLastCalledWith(8, 12, {a: '3'}, boundAt);
  });

  test('a widget that ran before "Clear cache" or its chat\'s history going keeps nothing more: a bubble built again starts empty', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    // * all of it, a chat's, a part of a chat's with the message (a topic found deleted)
    for(const event of [{accountNumber: account}, {accountNumber: account, peerId: 10}, {accountNumber: account, peerId: 10, mids: [20]}]) {
      const before = createMessageWidgetStorage(managers, 10 as PeerId, 20);
      vi.advanceTimersByTime(1);
      listeners.get('widget_storage_delete')(event);
      vi.advanceTimersByTime(1);
      before.commit('local', {a: '1'});
      before.commit('session', {b: '2'});
      const again = createMessageWidgetStorage(managers, 10 as PeerId, 20);
      expect(await again.load()).toEqual({local: {}, session: {}});
      before.flush();
      expect(widgetsManager.setWidgetStorage).not.toHaveBeenCalled();

      // one made after it keeps what it writes
      again.commit('local', {a: '3'});
      again.flush();
      expect(widgetsManager.setWidgetStorage).toHaveBeenLastCalledWith(10, 20, {a: '3'}, expect.any(Number));
      vi.clearAllMocks();
    }
  });

  test('a part of a chat\'s history going takes what the page keeps of its messages, and only theirs', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const taken = createMessageWidgetStorage(managers, 14 as PeerId, 60);
    const kept = createMessageWidgetStorage(managers, 14 as PeerId, 61);
    for(const storage of [taken, kept]) storage.commit('session', {b: '1'});
    vi.advanceTimersByTime(1);
    listeners.get('widget_storage_delete')({accountNumber: account, peerId: 14, mids: [60]});
    const session = async(mid: number) => (await createMessageWidgetStorage(managers, 14 as PeerId, mid).load()).session;
    expect(await session(60)).toEqual({});
    expect(await session(61)).toEqual({b: '1'});

    // * the widgets that ran before it: the taken message's keeps nothing more, the other one's does
    taken.commit('session', {b: '2'});
    kept.commit('session', {b: '3'});
    expect(await session(60)).toEqual({});
    expect(await session(61)).toEqual({b: '3'});
  });

  test('a deletion of an account the tab does not show takes what the page keeps of it, and only that', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const other = (account === 1 ? 2 : 1) as ActiveAccountNumber;
    const key = (accountNumber: number) => getWidgetKey(accountNumber, 10 as PeerId, 30);
    // its widget ran while the tab showed it
    const theirs = createMessageWidgetStorage(managers, 10 as PeerId, 30);
    theirs.commit('local', {a: '1'});
    theirs.commit('session', {b: '2'});
    rememberWidgetHeight(key(account), 100);

    setCurrentAccount(other);
    try {
      const ours = createMessageWidgetStorage(managers, 10 as PeerId, 30);
      ours.commit('local', {a: '3'});
      ours.commit('session', {b: '4'});
      rememberWidgetHeight(key(other), 200);

      // "Clear cache" of the account not shown, from another tab
      vi.advanceTimersByTime(1);
      listeners.get('widget_storage_delete')({accountNumber: account});
      expect(getRememberedWidgetHeight(key(account))).toBeUndefined();
      expect(getRememberedWidgetHeight(key(other))).toBe(200);
      expect(await ours.load()).toEqual({local: {a: '3'}, session: {b: '4'}});
    } finally {
      setCurrentAccount(account);
    }

    // back on it, the bubble built again starts empty
    vi.advanceTimersByTime(1);
    expect(await createMessageWidgetStorage(managers, 10 as PeerId, 30).load()).toEqual({local: {}, session: {}});
  });

  test('a widget message of an account the tab does not show, sent meanwhile: what its widget kept goes under the server\'s id', async() => {
    widgetsManager.getWidgetStorage.mockResolvedValue(undefined);
    const other = (account === 1 ? 2 : 1) as ActiveAccountNumber;
    const tempMid = 40.0001;
    const sending = createMessageWidgetStorage(managers, 11 as PeerId, tempMid);
    sending.commit('session', {b: '1'});

    setCurrentAccount(other);
    try {
      const ours = createMessageWidgetStorage(managers, 11 as PeerId, tempMid);
      ours.commit('session', {b: '2'});
      // its worker tells every tab, whichever account it shows
      listeners.get('widget_storage_remap')({accountNumber: account, peerId: 11, tempId: tempMid, mid: 41});
      expect(await ours.load()).toEqual({local: {}, session: {b: '2'}});
    } finally {
      setCurrentAccount(account);
    }

    // back on it, the bubble built under the server's id starts from it
    expect((await createMessageWidgetStorage(managers, 11 as PeerId, 41).load()).session).toEqual({b: '1'});
  });
});
