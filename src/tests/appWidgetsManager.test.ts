const disk = vi.hoisted(() => new Map<string, any>());
/**
 * AppStorage's cache: what a read brings is kept, and answers the next ones; a write, a deletion and a clear change it at
 * once. A read from the database answers what was there as it went out, and two at once are one.
 */
const cache = vi.hoisted(() => new Map<string, any>());
/** What a read from the database waits for: a slow disk. */
const reads = vi.hoisted(() => ({ready: Promise.resolve()}));
/**
 * With a passcode (encryptedStorageLayer.ts): the store is kept in memory and saved whole a moment after a change, of
 * what it holds then, and once more after a save on its way if it changed meanwhile; `saving` holds a save back, as
 * encrypting it does. A clear empties both at once.
 */
const encrypted = vi.hoisted(() => ({on: false, memory: new Map<string, any>(), saving: Promise.resolve(), running: false, again: false}));

vi.mock('@lib/storage', () => {
  const save = async(): Promise<void> => {
    if(encrypted.running) {
      encrypted.again = true;
      return;
    }

    encrypted.running = true;
    const snapshot = new Map(encrypted.memory);
    await encrypted.saving;
    disk.clear();
    snapshot.forEach((value, key) => disk.set(key, value));
    encrypted.running = false;
    if(encrypted.again) {
      encrypted.again = false;
      return save();
    }
  };
  const store = () => encrypted.on ? encrypted.memory : disk;
  return {
    default: class {
      reading = new Map<string, Promise<any>>();
      get = (key: string, useCache = true) => {
        if(useCache && cache.has(key)) return Promise.resolve(cache.get(key));
        let reading = this.reading.get(key);
        if(!reading) {
          const value = store().get(key);
          this.reading.set(key, reading = reads.ready.then(() => {
            this.reading.delete(key);
            cache.set(key, value);
            return value;
          }));
        }

        return reading;
      };
      set = async(values: Record<string, any>) => {
        Object.entries(values).forEach(([key, value]) => {
          cache.set(key, value);
          store().set(key, value);
        });
        if(encrypted.on) save();
      };
      delete = async(key: string) => {
        cache.delete(key);
        store().delete(key);
        if(encrypted.on) save();
      };
      clear = async() => {
        cache.clear();
        encrypted.memory.clear();
        disk.clear();
      };
      getAllKeys = async() => [...store().keys()];
    }
  };
});

import '@helpers/peerIdPolyfill';
import AppWidgetsManager from '@appManagers/appWidgetsManager';
import DialogsStorage from '@lib/storages/dialogs';
import {MESSAGE_ID_OFFSET, WIDGET_POLL_DEFAULT_PERIOD, WIDGET_POLL_MAX_PERIOD, WIDGET_POLL_MIN_PERIOD} from '@appManagers/constants';
import {MAX_REMEMBERED_HEIGHTS, type StoredWidgetHeight} from '@lib/widgetSandbox/sizing';

const USER = 100 as PeerId;
const CHANNEL = -2000 as PeerId;
const dispatched: [string, any][] = [];

function createManager() {
  const manager = new AppWidgetsManager() as any;
  const messages = {
    /** The channel's history is hidden up to this message. */
    cutoff: 0,
    deleted: new Set<string>(),
    /** The messages loaded here (all of them unless set). */
    loaded: undefined as Set<string>,
    /** What a loaded message has beyond being one. */
    fields: new Map<string, any>()
  };
  Object.assign(manager, {
    getAccountNumber: () => 1,
    rootScope: {
      dispatchEvent: (name: string, arg: any) => dispatched.push([name, arg]),
      dispatchEventOfAccount: (accountNumber: number, name: string, arg: any) => dispatched.push([name, arg])
    },
    appPeersManager: {isChannel: (peerId: PeerId) => peerId === CHANNEL},
    appMessagesManager: {
      isMessageIdUnavailableByChannelCutoff: (peerId: PeerId, mid: number) => peerId === CHANNEL && mid <= messages.cutoff,
      isMessageDeleted: (peerId: PeerId, mid: number) => messages.deleted.has(`${peerId}_${mid}`),
      getMessageByPeer: (peerId: PeerId, mid: number) => (!messages.loaded || messages.loaded.has(`${peerId}_${mid}`)) ? {_: 'message', ...messages.fields.get(`${peerId}_${mid}`)} : undefined,
      // the chat's messages loaded here: those with fields
      getHistoryMessagesStorage: (peerId: PeerId) => new Map([...messages.fields]
      .filter(([key]) => key.startsWith(`${peerId}_`) && (!messages.loaded || messages.loaded.has(key)))
      .map(([key, fields]) => {
        const mid = +key.slice(`${peerId}_`.length);
        return [mid, {_: 'message', mid, ...fields}];
      }))
    }
  });
  manager.after();
  return Object.assign(manager as AppWidgetsManager, {messages});
}

describe('widget storage on disk (docs/sdk-v1.md §2.8)', () => {
  beforeEach(() => {
    disk.clear();
    cache.clear();
  });

  test('one area per message: a forwarded copy in another chat starts empty, an empty area leaves nothing', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(USER, 7, {score: '3'});
    expect(await manager.getWidgetStorage(USER, 7)).toEqual({score: '3'});
    expect(await manager.getWidgetStorage(CHANNEL, 7)).toBeUndefined();

    await manager.setWidgetStorage(USER, 7, {});
    expect([...disk.keys()]).toEqual([]);
  });

  test('remembered heights: of messages the server knows and still has, gone with them', async() => {
    const manager = createManager();
    manager.messages.deleted.add(`${USER}_3`);
    await manager.setWidgetHeights([
      [`${USER}_1`, 120, '904_16'], [`${USER}_2`, 80, '904_16'], [`${USER}_3`, 90, '904_16'],
      // * a message being sent, a bubble of the widget sandbox's own
      [`${USER}_4.0001`, 70, '904_16'], [`${USER}_-1000000001`, 60, '904_16'],
      [`${CHANNEL}_${MESSAGE_ID_OFFSET + 1}`, 100, '904_16'], [`${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`, 110, '904_16']
    ], MAX_REMEMBERED_HEIGHTS);
    expect((await manager.getWidgetHeights()).map(([key]) => key)).toEqual([
      `${USER}_1`, `${USER}_2`, `${CHANNEL}_${MESSAGE_ID_OFFSET + 1}`, `${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`
    ]);
    // * the heights are no message's storage
    expect(await manager.getWidgetStorage(USER, 1)).toBeUndefined();

    // * deleted in a tab that shows another account: the worker drops them all the same
    await manager.deleteWidgetStorage(USER, [1]);
    await manager.deletePeerWidgetStorage(CHANNEL, 5);
    expect((await manager.getWidgetHeights()).map(([key]) => key)).toEqual([`${USER}_2`, `${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`]);

    // * changes that overlap — two deletions, a save — each start from what the one before wrote
    await manager.setWidgetHeights([[`${USER}_5`, 50, '904_16'], [`${USER}_6`, 60, '904_16'], [`${USER}_7`, 70, '904_16']], MAX_REMEMBERED_HEIGHTS);
    // (a message is marked deleted before its widget's storage goes)
    manager.messages.deleted.add(`${USER}_5`).add(`${USER}_6`);
    await Promise.all([
      manager.deleteWidgetStorage(USER, [5]),
      manager.deleteWidgetStorage(USER, [6]),
      manager.setWidgetHeights([[`${USER}_5`, 50, '904_16'], [`${USER}_6`, 60, '904_16'], [`${USER}_7`, 75, '904_16']], MAX_REMEMBERED_HEIGHTS)
    ]);
    expect(await manager.getWidgetHeights()).toEqual([
      [`${USER}_2`, 80, '904_16'], [`${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`, 110, '904_16'], [`${USER}_7`, 75, '904_16']
    ]);

    await manager.clearWidgetStorage();
    expect(await manager.getWidgetHeights()).toBeUndefined();
  });

  test('remembered heights of every tab of the account stay: a save puts its own over them, the newest kept', async() => {
    const manager = createManager();
    await manager.setWidgetHeights([[`${USER}_1`, 100, '904_16']], MAX_REMEMBERED_HEIGHTS);
    // * another tab, which read the disk before the first saved
    await manager.setWidgetHeights([[`${USER}_2`, 200, '904_16']], MAX_REMEMBERED_HEIGHTS);
    expect(await manager.getWidgetHeights()).toEqual([[`${USER}_1`, 100, '904_16'], [`${USER}_2`, 200, '904_16']]);
    await manager.setWidgetHeights([[`${USER}_1`, 120, '904_16']], MAX_REMEMBERED_HEIGHTS);
    expect(await manager.getWidgetHeights()).toEqual([[`${USER}_2`, 200, '904_16'], [`${USER}_1`, 120, '904_16']]);

    // * no more than a page keeps, the oldest go
    await manager.setWidgetHeights([[`${USER}_3`, 300, '904_16']], 2);
    expect(await manager.getWidgetHeights()).toEqual([[`${USER}_1`, 120, '904_16'], [`${USER}_3`, 300, '904_16']]);
  });

  test('goes with the message, the chat\'s history and the cache', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(USER, 1, {a: '1'});
    await manager.setWidgetStorage(USER, 2, {a: '2'});
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 1, {a: '3'});
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 9, {a: '4'});

    // * every deletion tells the tabs of every account (storage.ts): a tab showing another one hears nothing else of it
    dispatched.length = 0;
    await manager.deleteWidgetStorage(USER, [1]);
    expect(disk.has(`${USER}_1`)).toBe(false);

    // a channel's history hidden up to a message: the cut-off as the client keeps it, the message's id here
    manager.messages.cutoff = MESSAGE_ID_OFFSET + 5;
    await manager.deleteWidgetStorageByChannelCutoff(CHANNEL, MESSAGE_ID_OFFSET + 5);
    expect([...disk.keys()].sort()).toEqual([`${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`, `${USER}_2`].sort());
    // * the tabs are told the server's id: a newer message keeps what they keep of it (widgetSandboxClient.test.ts)
    expect(dispatched).toEqual([
      ['widget_storage_delete', {accountNumber: 1, peerId: USER, mids: [1]}],
      ['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL, maxId: 5}]
    ]);

    // a deleted chat (DialogsStorage.dropDialogOnDeletion, below): the tabs hear it too
    dispatched.length = 0;
    await manager.deletePeerWidgetStorage(CHANNEL);
    expect([...disk.keys()]).toEqual([`${USER}_2`]);
    expect(dispatched).toEqual([['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL}]]);

    await manager.clearWidgetStorage();
    expect(disk.size).toBe(0);
    expect(dispatched[1]).toEqual(['widget_storage_delete', {accountNumber: 1}]);
  });

  test('goes with a part of the chat\'s history - a topic, a span of dates - also where its messages are not loaded', async() => {
    const manager = createManager();
    const [inTopic, later] = [MESSAGE_ID_OFFSET + 1, MESSAGE_ID_OFFSET + 2];
    manager.messages.fields.set(`${CHANNEL}_${inTopic}`, {date: 100, reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 7}});
    manager.messages.fields.set(`${CHANNEL}_${later}`, {date: 200});
    await manager.setWidgetStorage(CHANNEL, inTopic, {a: '1'});
    await manager.setWidgetStorage(CHANNEL, later, {a: '2'});
    manager.messages.loaded = new Set();

    // * their heights go with them: the storage tells which messages they were
    await manager.setWidgetHeights([[`${CHANNEL}_${inTopic}`, 100, '904_16'], [`${CHANNEL}_${later}`, 110, '904_16']], MAX_REMEMBERED_HEIGHTS);

    dispatched.length = 0;
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => message.date >= 150);
    expect([...disk.keys()].filter((key) => key !== 'heights')).toEqual([`${CHANNEL}_${inTopic}`]);
    // * the tabs are told which messages, whichever account they show: nothing else tells them of a topic found deleted
    expect(dispatched).toEqual([['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL, mids: [later]}]]);
    expect((await manager.getWidgetHeights()).map(([key]) => key)).toEqual([`${CHANNEL}_${inTopic}`]);
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 7);
    expect([...disk.keys()]).toEqual(['heights']);
    expect(await manager.getWidgetHeights()).toEqual([]);
  });

  test('a page\'s heights taken before a deletion that took a message, coming after it, do not put its height back', async() => {
    const manager = createManager();
    const [inTopic, other] = [MESSAGE_ID_OFFSET + 1, MESSAGE_ID_OFFSET + 2];
    manager.messages.fields.set(`${CHANNEL}_${inTopic}`, {reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 7}});
    manager.messages.fields.set(`${CHANNEL}_${other}`, {});
    const heights: StoredWidgetHeight[] = [[`${CHANNEL}_${inTopic}`, 100, '904_16'], [`${CHANNEL}_${other}`, 110, '904_16']];
    await manager.setWidgetHeights(heights, MAX_REMEMBERED_HEIGHTS, Date.now());

    // * another tab took them just before the topic was found deleted
    const takenBefore = Date.now();
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 7);
    await manager.setWidgetHeights(heights, MAX_REMEMBERED_HEIGHTS, takenBefore);
    expect(await manager.getWidgetHeights()).toEqual([[`${CHANNEL}_${other}`, 110, '904_16']]);

    // * and just before "Clear cache"
    const takenBeforeClear = Date.now();
    await manager.clearWidgetStorage();
    await manager.setWidgetHeights(heights, MAX_REMEMBERED_HEIGHTS, takenBeforeClear);
    expect(await manager.getWidgetHeights()).toEqual([]);

    // * taken after them: kept
    await manager.setWidgetHeights([[`${CHANNEL}_${other}`, 120, '904_16']], MAX_REMEMBERED_HEIGHTS, Date.now() + 1);
    expect(await manager.getWidgetHeights()).toEqual([[`${CHANNEL}_${other}`, 120, '904_16']]);
  });

  test('a height of a message that keeps nothing in its storage goes with a part of the history too, its message loaded or not', async() => {
    const manager = createManager();
    const [inTopic, other] = [MESSAGE_ID_OFFSET + 1, MESSAGE_ID_OFFSET + 2];
    manager.messages.fields.set(`${CHANNEL}_${inTopic}`, {reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 7}});
    manager.messages.fields.set(`${CHANNEL}_${other}`, {date: 200});
    // * saved while the messages are loaded, as their widgets ran; one saved before what tells it was kept has nothing
    disk.set('heights', [[`${USER}_1`, 90, '904_16']]);
    await manager.setWidgetHeights([[`${CHANNEL}_${inTopic}`, 100, '904_16'], [`${CHANNEL}_${other}`, 110, '904_16']], MAX_REMEMBERED_HEIGHTS);
    // * a page gets them as it keeps them
    expect(await manager.getWidgetHeights()).toEqual([
      [`${USER}_1`, 90, '904_16'], [`${CHANNEL}_${inTopic}`, 100, '904_16'], [`${CHANNEL}_${other}`, 110, '904_16']
    ]);

    // * a reload: nothing of them is loaded, and none has storage
    manager.messages.loaded = new Set();
    expect(disk.has(`${CHANNEL}_${inTopic}`)).toBe(false);
    dispatched.length = 0;
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 7);
    expect(await manager.getWidgetHeights()).toEqual([[`${USER}_1`, 90, '904_16'], [`${CHANNEL}_${other}`, 110, '904_16']]);
    expect(dispatched).toEqual([['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL, mids: [inTopic]}]]);

    // * a page's save keeps what tells a height's message, also of one not loaded then: a span of dates takes it
    await manager.setWidgetHeights([[`${CHANNEL}_${other}`, 120, '904_16']], MAX_REMEMBERED_HEIGHTS);
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => message.date >= 150);
    expect(await manager.getWidgetHeights()).toEqual([[`${USER}_1`, 90, '904_16']]);
  });

  test('a commit made before "Clear cache" or a deletion that starts while it is on its way does not land after it', async() => {
    const manager = createManager();
    // * not loaded: the commit reads what the message's storage was told of it first
    manager.messages.loaded = new Set();
    const boundAt = Date.now() - 1;
    let read: () => void;
    reads.ready = new Promise((resolve) => read = resolve);
    const committed = manager.setWidgetStorage(USER, 1, {a: '1'}, boundAt);
    const cleared = manager.clearWidgetStorage();
    read();
    reads.ready = Promise.resolve();
    await Promise.all([committed, cleared]);
    expect(disk.size).toBe(0);

    // a deletion takes what was committed before it, also where nothing marks the message deleted (a topic)
    manager.messages.loaded = undefined;
    manager.messages.fields.set(`${CHANNEL}_${MESSAGE_ID_OFFSET + 1}`, {date: 100});
    await Promise.all([
      manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 1, {a: '2'}),
      manager.deleteWidgetStorageOf(CHANNEL, (message) => message.date === 100)
    ]);
    expect(disk.size).toBe(0);
  });

  test('after "Clear cache" a widget that ran before it writes nothing more; one started after it does', async() => {
    const manager = createManager();
    const before = Date.now() - 1;
    await manager.clearWidgetStorage();
    await manager.setWidgetStorage(USER, 1, {a: '1'}, before);
    await manager.setWidgetStorage(USER, 2, {a: '2'}, Date.now() + 1);
    expect([...disk.keys()]).toEqual([`${USER}_2`]);
  });

  test('a widget\'s last commit, as its bubble goes, does not bring back the storage of a message that is gone', async() => {
    const manager = createManager();
    manager.messages.deleted.add(`${USER}_1`);
    await manager.setWidgetStorage(USER, 1, {a: '1'});

    manager.messages.cutoff = MESSAGE_ID_OFFSET + 5;
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 2, {a: '2'});

    // a cleared history, or a chat left whose messages stay loaded here: a widget that ran before it writes nothing
    // more, one started after it does
    const before = Date.now() - 1;
    await manager.deletePeerWidgetStorage(USER);
    await manager.setWidgetStorage(USER, 3, {a: '3'}, before);
    await manager.setWidgetStorage(USER, 9, {a: '9'}, Date.now() + 1);

    // a message still being sent has a temporary id: its widget starts again under the server's
    await manager.setWidgetStorage(USER, 9.0001, {a: '10'});
    expect([...disk.keys()]).toEqual([`${USER}_9`]);
  });

  test('a deletion of messages that were never loaded finds them by their account-wide ids, not in channels', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(USER, 4, {a: '1'});
    await manager.setWidgetStorage(CHANNEL, 4, {a: '2'});
    dispatched.length = 0;
    await manager.deleteWidgetStorageByLegacyMids([4]);
    expect([...disk.keys()]).toEqual([`${CHANNEL}_4`]);
    // * the tabs are told by the ids, of whichever chats they are
    expect(dispatched).toEqual([['widget_storage_delete', {accountNumber: 1, mids: [4]}]]);

    // a widget's last commit after it does not bring it back, whichever chat the deletion was marked in
    await manager.setWidgetStorage(USER, 4, {a: '3'});
    expect([...disk.keys()]).toEqual([`${CHANNEL}_4`]);
  });

  test('a channel\'s history cleared up to a message takes the storage up to it, the newer messages keep theirs', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 3, {a: '1'});
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 8, {a: '2'});
    // * a message being sent: its temporary id, rounded, falls within, but the server's id comes after
    const pending = MESSAGE_ID_OFFSET + 5.0001;
    await manager.setWidgetStorage(CHANNEL, pending, {a: '5'}, Date.now());
    dispatched.length = 0;
    await manager.deletePeerWidgetStorage(CHANNEL, 5);
    expect([...disk.keys()]).toEqual([`${CHANNEL}_${MESSAGE_ID_OFFSET + 8}`]);
    expect(await manager.getWidgetStorage(CHANNEL, pending)).toEqual({a: '5'});
    manager.onWidgetMessageSent(CHANNEL, pending, MESSAGE_ID_OFFSET + 10);
    await vi.waitFor(() => expect(disk.get(`${CHANNEL}_${MESSAGE_ID_OFFSET + 10}`)?.values).toEqual({a: '5'}));
    expect(dispatched).toEqual([
      ['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL, maxId: 5}],
      ['widget_storage_remap', {accountNumber: 1, peerId: CHANNEL, tempId: pending, mid: MESSAGE_ID_OFFSET + 10}]
    ]);
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 9, {a: '3'});
    expect(disk.has(`${CHANNEL}_${MESSAGE_ID_OFFSET + 9}`)).toBe(true);
    // a widget's last commit within the cleared part does not bring its storage back
    await manager.setWidgetStorage(CHANNEL, MESSAGE_ID_OFFSET + 3, {a: '4'});
    expect(disk.has(`${CHANNEL}_${MESSAGE_ID_OFFSET + 3}`)).toBe(false);
  });

  test('a widget that ran before a part of its chat\'s history went writes nothing more for a message it took; one started after it does', async() => {
    const manager = createManager();
    const [inTopic, other] = [MESSAGE_ID_OFFSET + 1, MESSAGE_ID_OFFSET + 2];
    // * still loaded, and marked deleted nowhere: a topic learned deleted takes its messages' storage, nothing else
    manager.messages.fields.set(`${CHANNEL}_${inTopic}`, {reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 7}});
    const before = Date.now() - 1;
    dispatched.length = 0;
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 7);
    // * the tabs are told of a loaded one too, which has nothing on disk
    expect(dispatched).toEqual([['widget_storage_delete', {accountNumber: 1, peerId: CHANNEL, mids: [inTopic]}]]);
    await manager.setWidgetStorage(CHANNEL, inTopic, {a: '1'}, before);
    await manager.setWidgetStorage(CHANNEL, other, {a: '2'}, before);
    expect([...disk.keys()]).toEqual([`${CHANNEL}_${other}`]);

    await manager.setWidgetStorage(CHANNEL, inTopic, {a: '3'}, Date.now() + 1);
    expect(disk.has(`${CHANNEL}_${inTopic}`)).toBe(true);
    // * nor clears it (a commit that leaves nothing): the newer widget's stays
    await manager.setWidgetStorage(CHANNEL, inTopic, {}, before);
    expect(disk.has(`${CHANNEL}_${inTopic}`)).toBe(true);

    // * of a message not loaded here: what told it was in the part that went was kept with its storage, which went too
    const unloaded = MESSAGE_ID_OFFSET + 3;
    manager.messages.fields.set(`${CHANNEL}_${unloaded}`, {reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 8}});
    await manager.setWidgetStorage(CHANNEL, unloaded, {a: '4'});
    manager.messages.loaded = new Set();
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 8);
    expect(disk.has(`${CHANNEL}_${unloaded}`)).toBe(false);
    await manager.setWidgetStorage(CHANNEL, unloaded, {a: '5'}, before);
    expect(disk.has(`${CHANNEL}_${unloaded}`)).toBe(false);

    // * written while its message was not loaded (nothing kept of it), loaded again as the part goes: its storage goes
    // by the message, and a writer from before writes nothing more for it, loaded or not
    const unscoped = MESSAGE_ID_OFFSET + 4;
    await manager.setWidgetStorage(CHANNEL, unscoped, {a: '6'});
    expect(disk.get(`${CHANNEL}_${unscoped}`).message).toBeUndefined();
    manager.messages.fields.set(`${CHANNEL}_${unscoped}`, {reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: 9}});
    manager.messages.loaded = new Set([`${CHANNEL}_${unscoped}`]);
    await manager.deleteWidgetStorageOf(CHANNEL, (message) => (message.reply_to as any)?.reply_to_msg_id === 9);
    expect(disk.has(`${CHANNEL}_${unscoped}`)).toBe(false);
    manager.messages.loaded = new Set();
    await manager.setWidgetStorage(CHANNEL, unscoped, {a: '7'}, before);
    expect(disk.has(`${CHANNEL}_${unscoped}`)).toBe(false);
  });

  test('a widget of a message being sent: what it writes waits in memory and goes under the server\'s id with the message, also when it comes late', async() => {
    const manager = createManager();
    const temp = 11.0001;
    const boundAt = Date.now();
    await manager.setWidgetStorage(USER, temp, {a: '1'}, boundAt);
    expect(disk.size).toBe(0);
    expect(await manager.getWidgetStorage(USER, temp)).toEqual({a: '1'});

    // * as the send is finished in the account's own worker, also while every tab shows another account; the tabs are
    // told, whichever account they show
    dispatched.length = 0;
    manager.onWidgetMessageSent(USER, temp, 12);
    expect(dispatched).toEqual([['widget_storage_remap', {accountNumber: 1, peerId: USER, tempId: temp, mid: 12}]]);
    await vi.waitFor(async() => expect(await manager.getWidgetStorage(USER, 12)).toEqual({a: '1'}));
    expect(await manager.getWidgetStorage(USER, temp)).toBeUndefined();

    // * the widget's last write under the temporary id, as it stopped with the switch, comes after it
    await manager.setWidgetStorage(USER, temp, {a: '2'}, boundAt);
    expect(await manager.getWidgetStorage(USER, 12)).toEqual({a: '2'});

    // a message being sent called off takes what waits for it, in its own chat only: a temporary id is the chat's
    const OTHER_USER = 101 as PeerId;
    await manager.setWidgetStorage(USER, 14.0001, {a: '4'}, boundAt);
    await manager.setWidgetStorage(OTHER_USER, 14.0001, {a: '5'}, boundAt);
    await manager.deleteWidgetStorageByLegacyMids([14.0001], USER);
    expect(await manager.getWidgetStorage(USER, 14.0001)).toBeUndefined();
    expect(await manager.getWidgetStorage(OTHER_USER, 14.0001)).toEqual({a: '5'});

    // "Clear cache" takes what waits too
    await manager.setWidgetStorage(USER, 13.0001, {a: '3'}, boundAt);
    await manager.clearWidgetStorage();
    expect(await manager.getWidgetStorage(USER, 13.0001)).toBeUndefined();
  });

  test('a write for a message being sent from a widget that ran before a deletion that took it is not kept: a bubble built again would start from it', async() => {
    const before = Date.now() - 1;
    const pending = MESSAGE_ID_OFFSET + 5.0001;
    // "Clear cache" (in another tab: the write comes after it), the chat's history, a part of it with the message
    for(const deletion of [
      (manager: AppWidgetsManager) => manager.clearWidgetStorage(),
      (manager: AppWidgetsManager) => manager.deletePeerWidgetStorage(CHANNEL),
      (manager: AppWidgetsManager) => manager.deleteWidgetStorageOf(CHANNEL, (message) => message.date === 100)
    ]) {
      const manager = createManager();
      manager.messages.fields.set(`${CHANNEL}_${pending}`, {date: 100});
      await deletion(manager);
      await manager.setWidgetStorage(CHANNEL, pending, {a: '1'}, before);
      expect(await manager.getWidgetStorage(CHANNEL, pending)).toBeUndefined();

      // a widget started after it keeps what it writes, and the old one's late write leaves that alone
      await manager.setWidgetStorage(CHANNEL, pending, {a: '2'}, Date.now() + 1);
      await manager.setWidgetStorage(CHANNEL, pending, {a: '3'}, before);
      await manager.setWidgetStorage(CHANNEL, pending, {}, before);
      expect(await manager.getWidgetStorage(CHANNEL, pending)).toEqual({a: '2'});
    }
  });

  test('a read while "Clear cache" is on its way, or asked for meanwhile, answers what it leaves: a widget built again now would write back what it reads', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(USER, 1, {a: '1'});
    let read: () => void;
    const holdReads = () => reads.ready = new Promise((resolve) => read = resolve);

    // * the clear waits behind a write that reads first (its message is not loaded)
    manager.messages.loaded = new Set();
    holdReads();
    const writing = manager.setWidgetStorage(USER, 2, {a: '2'});
    const cleared = manager.clearWidgetStorage();
    const during = manager.getWidgetStorage(USER, 1);
    read();
    reads.ready = Promise.resolve();
    expect(await during).toBeUndefined();
    await Promise.all([writing, cleared]);

    // * a read from the database that began before the clear was asked for: what it brings does not stay in the store's
    // cache either, for the reads after it
    manager.messages.loaded = undefined;
    await manager.setWidgetStorage(USER, 3, {a: '3'}, Date.now() + 1);
    cache.clear();
    holdReads();
    const begun = manager.getWidgetStorage(USER, 3);
    const clearedAgain = manager.clearWidgetStorage();
    // * the read comes back after the clear has done what it can without it
    await new Promise((resolve) => setTimeout(resolve));
    read();
    reads.ready = Promise.resolve();
    expect(await begun).toBeUndefined();
    await clearedAgain;
    expect(await manager.getWidgetStorage(USER, 3)).toBeUndefined();
  });

  test('a read from the database on its way as a commit of the message comes does not put what it found over the commit', async() => {
    const manager = createManager();
    await manager.setWidgetStorage(USER, 1, {a: '1'});
    cache.clear();
    let read: () => void;
    reads.ready = new Promise((resolve) => read = resolve);
    const reading = manager.getWidgetStorage(USER, 1);
    const committed = manager.setWidgetStorage(USER, 1, {a: '2'});
    // * the read comes back after the commit has done what it can without it
    await new Promise((resolve) => setTimeout(resolve));
    read();
    reads.ready = Promise.resolve();
    expect(await reading).toEqual({a: '2'});
    await committed;
    // * nor in the store's cache, which the next widget started starts from
    expect(await manager.getWidgetStorage(USER, 1)).toEqual({a: '2'});
  });

  test('with a passcode "Clear cache" is not undone by a save of the store still on its way', async() => {
    encrypted.on = true;
    try {
      const manager = createManager();
      let encrypt: () => void;
      encrypted.saving = new Promise((resolve) => encrypt = resolve);
      await manager.setWidgetStorage(USER, 1, {a: '1'});
      await manager.clearWidgetStorage();
      encrypt();
      await vi.waitFor(() => expect(encrypted.running).toBe(false));
      expect(disk.size).toBe(0);
    } finally {
      encrypted.on = false;
      encrypted.memory.clear();
      encrypted.saving = Promise.resolve();
    }
  });
});

describe('the widget\'s requests and its shared state (docs/tgw-format.md, "The widget\'s state and requests")', () => {
  function createConnectedManager(answer: any, media: any = {_: 'messageMediaWidget', pFlags: {}, public_data_hash: '77'}) {
    const manager = createManager() as any;
    const calls: any[] = [];
    const applied: any[] = [];
    Object.assign(manager, {
      apiManager: {invokeApi: async(method: string, params: any, options: any) => (calls.push({method, params, options}), answer)},
      appPeersManager: {...manager.appPeersManager, getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId})},
      appMessagesManager: {
        ...manager.appMessagesManager,
        getMessageByPeer: () => ({_: 'message', media}),
        setMessagesWidgetData: (messages: any[], data: any) => applied.push({messages, data})
      }
    });
    return {manager: manager as AppWidgetsManager, calls, applied};
  }

  test('a request goes like a callback button\'s press, its data as UTF-8, once (a 5xx may hide one the bot ran), and a flood wait is not waited out', async() => {
    const {manager, calls} = createConnectedManager({_: 'messages.botWidgetQueryAnswer', result: 'ok'});
    expect(await manager.getBotWidgetQueryAnswer(USER, 7, 'vote:ё')).toEqual({_: 'messages.botWidgetQueryAnswer', result: 'ok'});
    expect(calls[0].method).toBe('messages.getBotWidgetQueryAnswer');
    expect(calls[0].params.msg_id).toBe(7);
    expect(new TextDecoder().decode(calls[0].params.data)).toBe('vote:ё');
    expect(calls[0].params.query_type).toEqual({_: 'widgetQueryTypeData', pFlags: {}});
    expect(calls[0].options).toEqual({floodMaxTimeout: 0, noRetry: true});
  });

  test('a request the bot does not answer in 30 s fails: offline it would wait for the connection, the widget for it', async() => {
    vi.useFakeTimers();
    try {
      const {manager} = createConnectedManager(undefined);
      let answer: (value: any) => void;
      const invokeApi = vi.fn(() => new Promise((resolve) => answer = resolve));
      (manager as any).apiManager = {invokeApi};
      const request = manager.getBotWidgetQueryAnswer(USER, 7, 'vote');
      const failed = expect(request).rejects.toMatchObject({type: 'TIMEOUT'});
      await vi.advanceTimersByTimeAsync(29e3);
      let settled = false;
      request.catch(() => settled = true);
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1e3);
      await failed;

      // * nothing takes it back: still on its way, it goes once the connection is back, and the bot would get the
      // widget's next one as well — that fails at once, until the first is done
      await expect(manager.getBotWidgetQueryAnswer(USER, 7, 'vote')).rejects.toMatchObject({type: 'TIMEOUT'});
      expect(invokeApi).toHaveBeenCalledTimes(1);
      answer({_: 'messages.botWidgetQueryAnswer'});
      await vi.advanceTimersByTimeAsync(0);
      const next = manager.getBotWidgetQueryAnswer(USER, 7, 'vote');
      expect(invokeApi).toHaveBeenCalledTimes(2);
      answer({_: 'messages.botWidgetQueryAnswer', result: 'ok'});
      expect(await next).toEqual({_: 'messages.botWidgetQueryAnswer', result: 'ok'});
    } finally {
      vi.useRealTimers();
    }
  });

  test('a message being sent asks nothing: its temporary id would name the message before it', async() => {
    const {manager, calls} = createConnectedManager({_: 'messages.widgetPublicData', hash: '78', data: 'x', period: 5});
    await expect(manager.getBotWidgetQueryAnswer(USER, 7.0001, 'vote')).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
    // * the tab asks again the default period later
    const at = Date.now();
    expect(await manager.pollWidgetPublicData(USER, 7.0001, [{peerId: USER, mid: 7.0001}])).toBeGreaterThanOrEqual(at + WIDGET_POLL_DEFAULT_PERIOD * 1e3);
    expect(calls).toEqual([]);
  });

  test('a poll answer goes into no message whose widget was replaced meanwhile, even at the same hash', async() => {
    const media: Record<string, any> = {
      [`${USER}_7`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '5'},
      [`${USER}_8`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '5'}
    };
    const {manager, applied} = createConnectedManager(undefined);
    Object.assign((manager as any).apiManager, {invokeApi: async() => {
      // the bot replaces the widget in message 8 with another one while the poll is out
      media[`${USER}_8`] = {_: 'messageMediaWidget', pFlags: {}, widget_id: '6'};
      return {_: 'messages.widgetPublicData', hash: '78', data: 'new', period: 5};
    }});
    Object.assign((manager as any).appMessagesManager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => ({_: 'message', media: media[`${peerId}_${mid}`]})
    });
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(applied.map(({messages}) => messages)).toEqual([[{peerId: USER, mid: 7}]]);
  });

  test('a poll asks with the hash the message has; a new shared state goes into every carrier, and the next poll goes the period later', async() => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const carriers = [{peerId: USER, mid: 7}, {peerId: CHANNEL, mid: MESSAGE_ID_OFFSET + 3}];
      const changed = createConnectedManager({_: 'messages.widgetPublicData', hash: '78', data: '{"v":[1]}', period: 12});
      expect(await changed.manager.pollWidgetPublicData(USER, 7, carriers)).toBe(now + 12e3);
      expect(changed.calls[0].params.hash).toBe('77');
      // * once: a failure is not asked again a second later but when the next poll goes (as told the tabs)
      expect(changed.calls[0].options).toEqual({floodMaxTimeout: 0, noRetry: true});
      expect(changed.applied).toEqual([{messages: carriers, data: {public_data: '{"v":[1]}', public_data_hash: '78'}}]);

      const same = createConnectedManager({_: 'messages.widgetPublicDataNotModified', period: 30}, {_: 'messageMediaWidget', pFlags: {}});
      expect(await same.manager.pollWidgetPublicData(USER, 7, carriers)).toBe(now + 30e3);
      expect(same.calls[0].params.hash).toBe(0);
      expect(same.applied).toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });

  test('a period out of the server\'s range is taken as its nearest end, for every tab: the next poll asks then', async() => {
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for(const [period, taken] of [[1, WIDGET_POLL_MIN_PERIOD], [7200, WIDGET_POLL_MAX_PERIOD], [0, WIDGET_POLL_DEFAULT_PERIOD]]) {
        const {manager, calls} = createConnectedManager({_: 'messages.widgetPublicDataNotModified', period}, {_: 'messageMediaWidget', pFlags: {}, widget_id: '9'});
        expect(await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}])).toBe(now + taken * 1e3);
        now += taken * 1e3;
        await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
        expect(calls.length).toBe(2);
      }
    } finally {
      clock.mockRestore();
    }
  });

  test('a flood wait holds the next poll as long as it says, the period stays the server\'s: a failure after it waits that period', async() => {
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const {manager, calls} = createConnectedManager(undefined, {_: 'messageMediaWidget', pFlags: {}, widget_id: '10'});
      const answers: any[] = [{_: 'messages.widgetPublicDataNotModified', period: 5}, {type: 'FLOOD_WAIT_3600'}, {type: 'INTERNAL', code: 500}];
      Object.assign((manager as any).apiManager, {
        invokeApi: async(method: string, params: any) => {
          calls.push({method, params});
          const answer = answers.shift();
          if(answer.type) throw answer;
          return answer;
        }
      });
      const poll = () => manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
      expect(await poll()).toBe(now + 5e3);
      now += 5e3;
      expect(await poll()).toBe(now + 3600e3);
      now += 3600e3;
      expect(await poll()).toBe(now + 5e3);
      expect(calls.length).toBe(3);
    } finally {
      clock.mockRestore();
    }
  });

  test('a carrier that came in after the poll that brought the new value gets it from the next one, answered "not modified"', async() => {
    const media: Record<string, any> = {
      [`${USER}_7`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '5', public_data_hash: '77'},
      [`${USER}_8`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '5', public_data_hash: '77'}
    };
    const answers: any[] = [{_: 'messages.widgetPublicData', hash: '78', data: 'new', period: 5}, {_: 'messages.widgetPublicDataNotModified', period: 5}];
    const {manager, applied} = createConnectedManager(undefined);
    Object.assign((manager as any).apiManager, {invokeApi: async() => answers.shift()});
    // * each poll comes the period after the one before, as a tab's do
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now += 5e3);
    Object.assign((manager as any).appMessagesManager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => ({_: 'message', media: media[`${peerId}_${mid}`]}),
      setMessagesWidgetData: (messages: any[], data: any) => {
        applied.push({messages, data});
        for(const {peerId, mid} of messages) Object.assign(media[`${peerId}_${mid}`], data);
      }
    });
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(applied.map(({messages}) => messages)).toEqual([[{peerId: USER, mid: 7}], [{peerId: USER, mid: 8}]]);
    expect(media[`${USER}_8`]).toMatchObject({public_data: 'new', public_data_hash: '78'});

    // the bot's edit took the message further since: "not modified" for its hash confirms that one, not an older poll's
    Object.assign(media[`${USER}_7`], {public_data: 'newer', public_data_hash: '79'});
    answers.push({_: 'messages.widgetPublicDataNotModified', period: 5});
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(media[`${USER}_7`]).toMatchObject({public_data: 'newer', public_data_hash: '79'});
    expect(media[`${USER}_8`]).toMatchObject({public_data: 'newer', public_data_hash: '79'});

    // the message asked through is edited while the poll is out: nothing older is written over it
    answers.push({_: 'messages.widgetPublicDataNotModified', period: 5});
    const invoke = (manager as any).apiManager.invokeApi;
    (manager as any).apiManager.invokeApi = async(...args: any[]) => {
      Object.assign(media[`${USER}_7`], {public_data: 'edited', public_data_hash: '80'});
      return invoke(...args);
    };
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(media[`${USER}_7`]).toMatchObject({public_data: 'edited', public_data_hash: '80'});
    expect(media[`${USER}_8`]).toMatchObject({public_data: 'newer', public_data_hash: '79'});

    // another carrier gets an update of its own while the poll is out: the answer is older, it keeps the update
    answers.push({_: 'messages.widgetPublicData', hash: '81', data: 'polled', period: 5});
    (manager as any).apiManager.invokeApi = async(...args: any[]) => {
      Object.assign(media[`${USER}_8`], {public_data: 'pushed', public_data_hash: '82'});
      return invoke(...args);
    };
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(media[`${USER}_7`]).toMatchObject({public_data: 'polled', public_data_hash: '81'});
    expect(media[`${USER}_8`]).toMatchObject({public_data: 'pushed', public_data_hash: '82'});
    (manager as any).apiManager.invokeApi = invoke;

    // an emptied state is a value: a carrier that came in after the poll that emptied it is emptied by the next one
    answers.push({_: 'messages.widgetPublicData', hash: 0, data: '', period: 5}, {_: 'messages.widgetPublicDataNotModified', period: 5});
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
    expect(media[`${USER}_7`]).toEqual({_: 'messageMediaWidget', pFlags: {}, widget_id: '5', public_data: '', public_data_hash: 0});
    await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    expect(media[`${USER}_8`]).toMatchObject({public_data: '', public_data_hash: 0});
    clock.mockRestore();
  });

  test('what a carrier shows is taken as its request begins: an edit after a failed poll or a poll in the period does not hold the next answer back', async() => {
    const media: Record<string, any> = Object.fromEntries([7, 8].map((mid) => [`${USER}_${mid}`, {_: 'messageMediaWidget', pFlags: {}, widget_id: '8', public_data_hash: '77'}]));
    const {manager, calls} = createConnectedManager(undefined);
    const answers: any[] = [];
    Object.assign((manager as any).apiManager, {
      invokeApi: async(method: string, params: any) => {
        calls.push({method, params});
        const answer = answers.shift();
        if(answer.type) throw answer;
        return answer;
      }
    });
    Object.assign((manager as any).appMessagesManager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => ({_: 'message', media: media[`${peerId}_${mid}`]}),
      setMessagesWidgetData: (messages: any[], data: any) => {
        for(const {peerId, mid} of messages) Object.assign(media[`${peerId}_${mid}`], data);
      }
    });
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      // * a poll that fails, then a bot's edit of the message: the next poll's answer goes to it
      answers.push({type: 'INTERNAL', code: 500});
      const held = now + WIDGET_POLL_DEFAULT_PERIOD * 1e3;
      expect(await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}])).toBe(held);
      // * before any answer gave the server's period, a failure holds another tab a second later for the default one
      now += 1e3;
      expect(await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])).toBe(held);
      expect(calls.length).toBe(1);
      now = held;
      Object.assign(media[`${USER}_7`], {public_data: 'edited', public_data_hash: '78'});
      answers.push({_: 'messages.widgetPublicData', hash: '79', data: 'polled', period: 10});
      const next = now + 10e3;
      expect(await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}])).toBe(next);
      expect(media[`${USER}_7`]).toMatchObject({public_data: 'polled', public_data_hash: '79'});

      // * another tab's poll within the period, then its message read again: the next answer goes to it
      now += 5e3;
      expect(await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])).toBe(next);
      Object.assign(media[`${USER}_8`], {public_data: 'read', public_data_hash: '80'});
      now += 5e3;
      answers.push({_: 'messages.widgetPublicData', hash: '81', data: 'polled again', period: 10});
      await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
      for(const mid of [7, 8]) expect(media[`${USER}_${mid}`]).toMatchObject({public_data: 'polled again', public_data_hash: '81'});

      // * a failure holds the other tabs for the last answer's period, and its carriers go with the next request
      now += 10e3;
      answers.push({type: 'INTERNAL', code: 500});
      expect(await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}])).toBe(now + 10e3);
      expect(await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])).toBe(now + 10e3);
      expect(calls.length).toBe(4);
      now += 10e3;
      answers.push({_: 'messages.widgetPublicData', hash: '82', data: 'after the failure', period: 10});
      await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}]);
      expect(calls.length).toBe(5);
      for(const mid of [7, 8]) expect(media[`${USER}_${mid}`]).toMatchObject({public_data: 'after the failure', public_data_hash: '82'});
    } finally {
      clock.mockRestore();
    }
  });

  test('two tabs whose polls meet with carriers in common: the answer goes once to all of them', async() => {
    const media: Record<string, any> = Object.fromEntries([7, 8, 9].map((mid) => [`${USER}_${mid}`, {_: 'messageMediaWidget', pFlags: {}, widget_id: '7', public_data_hash: '77'}]));
    const {manager, calls} = createConnectedManager(undefined);
    let answer: (value: any) => void;
    Object.assign((manager as any).apiManager, {
      invokeApi: (method: string, params: any) => (calls.push({method, params}), new Promise((resolve) => answer = resolve))
    });
    Object.assign((manager as any).appMessagesManager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => ({_: 'message', media: media[`${peerId}_${mid}`]}),
      setMessagesWidgetData: (messages: any[], data: any) => {
        for(const {peerId, mid} of messages) Object.assign(media[`${peerId}_${mid}`], data);
      }
    });
    // * one tab through 7 for 7 and 8, the other through 8 for 8 and 9, while the first is out
    const first = manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}, {peerId: USER, mid: 8}]);
    const second = manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}, {peerId: USER, mid: 9}]);
    answer({_: 'messages.widgetPublicData', hash: '78', data: 'new', period: 5});
    // * both tabs poll next at the same time
    const [firstNext, secondNext] = await Promise.all([first, second]);
    expect(firstNext).toBe(secondNext);
    expect(calls.length).toBe(1);
    for(const mid of [7, 8, 9]) expect(media[`${USER}_${mid}`]).toMatchObject({public_data: 'new', public_data_hash: '78'});
  });

  test('every tab polls on its own, the server is asked once a period: the answer goes to every tab\'s messages, a flood wait holds them all', async() => {
    const media: Record<string, any> = {
      [`${USER}_7`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '6', public_data_hash: '77'},
      [`${USER}_8`]: {_: 'messageMediaWidget', pFlags: {}, widget_id: '6', public_data_hash: '77'}
    };
    const {manager, calls} = createConnectedManager(undefined);
    let answer: any = {_: 'messages.widgetPublicData', hash: '78', data: 'new', period: 10};
    Object.assign((manager as any).apiManager, {
      invokeApi: async(method: string, params: any) => {
        calls.push({method, params});
        if(answer instanceof Error || answer.type) throw answer;
        return answer;
      }
    });
    Object.assign((manager as any).appMessagesManager, {
      getMessageByPeer: (peerId: PeerId, mid: number) => ({_: 'message', media: media[`${peerId}_${mid}`]}),
      setMessagesWidgetData: (messages: any[], data: any) => {
        for(const {peerId, mid} of messages) Object.assign(media[`${peerId}_${mid}`], data);
      }
    });
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      // * two tabs at once: one request, its answer for both
      const tabs = await Promise.all([
        manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]),
        manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])
      ]);
      expect(tabs).toEqual([now + 10e3, now + 10e3]);
      expect(calls.length).toBe(1);
      expect(media[`${USER}_8`]).toMatchObject({public_data: 'new', public_data_hash: '78'});

      // * within the period: nothing asked, nothing written; the next answer goes to that tab's message too
      media[`${USER}_8`] = {_: 'messageMediaWidget', pFlags: {}, widget_id: '6', public_data_hash: '77'};
      now += 5e3;
      expect(await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])).toBe(now + 5e3);
      expect(calls.length).toBe(1);
      expect(media[`${USER}_8`]).toMatchObject({public_data_hash: '77'});
      now += 5e3;
      answer = {_: 'messages.widgetPublicData', hash: '79', data: 'newer', period: 10};
      await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}]);
      expect(calls.length).toBe(2);
      expect(media[`${USER}_8`]).toMatchObject({public_data: 'newer', public_data_hash: '79'});

      // * a flood wait told one tab holds the other until it ends: both poll next then
      now += 10e3;
      answer = {type: 'FLOOD_WAIT_60'};
      const floodEnds = now + 60e3;
      expect(await manager.pollWidgetPublicData(USER, 7, [{peerId: USER, mid: 7}])).toBe(floodEnds);
      now += 29.5e3;
      expect(await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}])).toBe(floodEnds);
      now += 0.5e3;
      expect(calls.length).toBe(3);
      now += 31e3;
      answer = {_: 'messages.widgetPublicDataNotModified', period: 10};
      await manager.pollWidgetPublicData(USER, 8, [{peerId: USER, mid: 8}]);
      expect(calls.length).toBe(4);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('a chat\'s dialog dropped as it goes (DialogsStorage.dropDialogOnDeletion)', () => {
  test('takes its widgets\' storage when the whole chat goes, not with a topic or a saved dialog, whatever is cached', () => {
    const deletePeerWidgetStorage = vi.fn();
    const dialogsStorage = Object.assign(Object.create(DialogsStorage.prototype), {
      dropDialogWithEvent: vi.fn(),
      appPeersManager: {isBroadcast: () => false},
      rootScope: {dispatchEvent: vi.fn()},
      appWidgetsManager: {deletePeerWidgetStorage}
    }) as DialogsStorage;
    // * a saved dialog of the account's own chat, whose dialog is not cached
    dialogsStorage.dropDialogOnDeletion(USER, 5);
    expect(deletePeerWidgetStorage).not.toHaveBeenCalled();
    dialogsStorage.dropDialogOnDeletion(CHANNEL);
    expect(deletePeerWidgetStorage).toHaveBeenCalledWith(CHANNEL);
  });
});
