/*
 * A discussion thread's count is the number of its comments as the server gives it (tdesktop shows
 * RepliesList::maybeFullCount unchanged): the post it starts from and the "Discussion started" line the client adds
 * are not counted, a page that did not cover the whole thread never makes its length the total nor lowers a known
 * one, and a cached slice whose total is unknown is loaded again instead of being shown as the whole thread.
 * The root a discussion starts from is taken whether or not the server put its replies on it.
 */

import {describe, expect, test, vi} from 'vitest';
import type {Message, MessagesMessages} from '@layer';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager, HistoryStorage, HistoryType} from '@appManagers/appMessagesManager';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import {SliceEnd} from '@helpers/slicedArray';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

const GROUP_ID = 1000000001 as ChatId;
const GROUP_PEER_ID = GROUP_ID.toPeerId(true);
const ROOT = 472;
const COMMENT = 475;
const SERVICE = 472.0001;

function makeMessage(mid: number, extra: Partial<Message.message> = {}): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    date: mid,
    message: 'text ' + mid,
    peer_id: {_: 'peerChannel', channel_id: GROUP_ID},
    peerId: GROUP_PEER_ID,
    ...extra
  } as Message.message;
}

function makeThreadStorage(): HistoryStorage {
  return createHistoryStorage({type: 'replies', peerId: GROUP_PEER_ID, threadId: ROOT});
}

function makeManager(root: Message.message = makeMessage(ROOT)) {
  const manager = new AppMessagesManager() as any;
  Object.assign(manager, {
    appPeersManager: {getPeerMigratedTo: (): PeerId => undefined, isPeerRestricted: () => false, isMonoforum: () => false},
    middleware: {get: () => () => true},
    getChannelAvailableMinIdGeneration: () => 0,
    mergeReplyKeyboard: () => false,
    reloadConversation: vi.fn(),
    groupedMessagesStorage: {},
    getMessageByPeer: (peerId: PeerId, mid: number) => mid === ROOT ? root : undefined,
    generateThreadServiceStartMessage: vi.fn(() => SERVICE),
    getMidsByMessage: (message: Message.message) => [message.mid],
    log: () => {}
  });
  return manager;
}

function countless(mids: number[]) {
  return {
    _: 'messages.messages',
    messages: mids.map((mid) => makeMessage(mid)),
    chats: [],
    users: [],
    topics: []
  } as MessagesMessages.messagesMessages;
}

function counted(mids: number[], count: number) {
  return {
    _: 'messages.channelMessages',
    pFlags: {},
    pts: 1,
    count,
    messages: mids.map((mid) => makeMessage(mid)),
    chats: [],
    users: [],
    topics: []
  } as MessagesMessages.messagesChannelMessages;
}

function fill(manager: any, historyStorage: HistoryStorage, result: any, options: {offsetId?: number, addOffset?: number, limit?: number}) {
  manager.requestHistory = () => Promise.resolve(result);
  return manager.fillHistoryStorage({
    peerId: GROUP_PEER_ID,
    threadId: ROOT,
    historyType: HistoryType.Thread,
    historyStorage,
    offsetId: 0,
    addOffset: 0,
    limit: 20,
    recursion: true,
    ...options
  });
}

describe('the count of a discussion thread', () => {
  test('is the server\'s count, without the post or the "Discussion started" line', async() => {
    const historyStorage = makeThreadStorage();
    await fill(makeManager(), historyStorage, counted([COMMENT], 1), {});

    expect(historyStorage.count).toBe(1);
    expect([...historyStorage.history.first]).toEqual([COMMENT, SERVICE, ROOT]);
  });

  test('is the length of a page without a count that holds the whole thread', async() => {
    const historyStorage = makeThreadStorage();
    await fill(makeManager(), historyStorage, countless([COMMENT]), {});

    expect(historyStorage.count).toBe(1);
  });

  test('is kept by an empty page without a count below the newest comment', async() => {
    const historyStorage = makeThreadStorage();
    historyStorage.count = 1;
    await fill(makeManager(), historyStorage, countless([]), {offsetId: COMMENT});

    expect(historyStorage.count).toBe(1);
  });

  test('stays unknown, not zero, after an empty page without a count below the newest comment', async() => {
    const historyStorage = makeThreadStorage();
    await fill(makeManager(), historyStorage, countless([]), {offsetId: COMMENT});

    expect(historyStorage.count).toBeNull();
  });

  test('is not lowered by a part of the thread without a count', async() => {
    const historyStorage = makeThreadStorage();
    historyStorage.count = 5;
    await fill(makeManager(), historyStorage, countless([COMMENT, COMMENT - 1]), {offsetId: COMMENT + 10, limit: 2});

    expect(historyStorage.count).toBe(5);
  });

  test('is the length of a page without a count that reaches both ends around a message', async() => {
    const historyStorage = makeThreadStorage();
    await fill(makeManager(), historyStorage, countless([COMMENT + 1, COMMENT, COMMENT - 1]), {offsetId: COMMENT, addOffset: -10, limit: 20});

    expect(historyStorage.count).toBe(3);
  });

  test('stays unknown after a page without a count that reaches only one end', async() => {
    const historyStorage = makeThreadStorage();
    await fill(makeManager(), historyStorage, countless([COMMENT, COMMENT - 1]), {offsetId: COMMENT + 10, limit: 2});

    expect(historyStorage.count).toBeNull();
  });
});

describe('the start of a discussion thread', () => {
  test('is the root even when the server left its replies out', async() => {
    const historyStorage = makeThreadStorage();
    const manager = makeManager(makeMessage(ROOT));
    await fill(manager, historyStorage, counted([COMMENT], 1), {});

    expect(manager.generateThreadServiceStartMessage).toHaveBeenCalledWith(expect.objectContaining({mid: ROOT}));
    expect([...historyStorage.history.first]).toEqual([COMMENT, SERVICE, ROOT]);
  });

  test('is left out, without failing the load, when the root is gone', async() => {
    const historyStorage = makeThreadStorage();
    const manager = makeManager(null);
    await fill(manager, historyStorage, counted([COMMENT], 1), {});

    expect(manager.generateThreadServiceStartMessage).not.toHaveBeenCalled();
    expect(historyStorage.count).toBe(1);
    expect([...historyStorage.history.first]).toEqual([COMMENT]);
  });
});

describe('a discussion root asked for a post', () => {
  function getDiscussionMessage(messages: Message.message[], grouped?: Message.message[]) {
    const manager = new AppMessagesManager() as any;
    const historyStorage = makeThreadStorage();
    Object.assign(manager, {
      getChannelAvailableMinIdGeneration: () => 0,
      appPeersManager: {getInputPeerById: () => ({_: 'inputPeerChannel'})},
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      saveApiResult: () => {},
      getHistoryStorage: () => historyStorage,
      groupedMessagesStorage: grouped ? {g: new Map(grouped.map((message) => [message.mid, message]))} : {},
      threadsToReplies: {},
      log: () => {},
      apiManager: {
        invokeApiSingleProcess: ({processResult}: any) => Promise.resolve(processResult({
          _: 'messages.discussionMessage',
          messages,
          chats: [],
          users: [],
          max_id: COMMENT,
          unread_count: 0
        }))
      }
    });
    return manager.getDiscussionMessage((1 as ChatId).toPeerId(true), 153);
  }

  test('is the first message returned, with or without its replies', async() => {
    await expect(getDiscussionMessage([makeMessage(ROOT)])).resolves.toMatchObject({mid: ROOT});
    await expect(getDiscussionMessage([makeMessage(ROOT, {replies: {_: 'messageReplies', pFlags: {}, replies: 1, replies_pts: 1}})]))
    .resolves.toMatchObject({mid: ROOT});
  });

  test('of an album is the part that carries the replies, else its main one', async() => {
    const withReplies = [
      makeMessage(ROOT, {grouped_id: 'g'}),
      makeMessage(ROOT + 1, {grouped_id: 'g', replies: {_: 'messageReplies', pFlags: {}, replies: 1, replies_pts: 1}})
    ];
    await expect(getDiscussionMessage([withReplies[0]], withReplies)).resolves.toMatchObject({mid: ROOT + 1});

    const without = [makeMessage(ROOT, {grouped_id: 'g'}), makeMessage(ROOT + 1, {grouped_id: 'g'})];
    await expect(getDiscussionMessage([without[1]], without)).resolves.toMatchObject({mid: ROOT});
  });

  test('is nothing when the server returns none', async() => {
    await expect(getDiscussionMessage([])).resolves.toBeUndefined();
  });
});

describe('entering a discussion thread again', () => {
  function getHistory(historyStorage: HistoryStorage) {
    const manager = makeManager();
    manager.fillHistoryStorage = vi.fn(async() => {
      historyStorage.count = 1;
      return counted([COMMENT], 1);
    });
    const result = manager.getHistory({
      peerId: GROUP_PEER_ID,
      threadId: ROOT,
      historyType: HistoryType.Thread,
      historyStorage,
      offsetId: 0,
      limit: 20
    });
    return {manager, result};
  }

  function makeCompleteSlice() {
    const historyStorage = makeThreadStorage();
    historyStorage.history.insertSlice([COMMENT, SERVICE, ROOT]);
    historyStorage.history.first.setEnd(SliceEnd.Both);
    return historyStorage;
  }

  test('takes the cached thread when its count is known', async() => {
    const historyStorage = makeCompleteSlice();
    historyStorage.count = 1;
    const {manager, result} = getHistory(historyStorage);

    expect(manager.fillHistoryStorage).not.toHaveBeenCalled();
    expect(await result).toMatchObject({count: 1, history: [COMMENT, SERVICE, ROOT]});
  });

  test('loads it again when the cached slice has no known count', async() => {
    const historyStorage = makeCompleteSlice();
    const {manager, result} = getHistory(historyStorage);

    expect(manager.fillHistoryStorage).toHaveBeenCalledTimes(1);
    expect(await result).toMatchObject({count: 1});
  });
});

describe('a channel cutoff', () => {
  test('makes unknown only the counts of threads it reaches', () => {
    const manager = new AppMessagesManager() as any;
    // * mids as the client makes them of a channel's server ids
    const mid = (id: number) => MESSAGE_ID_OFFSET + id;
    const above = createHistoryStorage({type: 'replies', peerId: GROUP_PEER_ID, threadId: mid(ROOT)});
    const below = createHistoryStorage({type: 'replies', peerId: GROUP_PEER_ID, threadId: mid(100)});
    // * above the cutoff, yet it lost messages to it
    const emptied = createHistoryStorage({type: 'replies', peerId: GROUP_PEER_ID, threadId: mid(ROOT + 1)});
    above.count = below.count = emptied.count = 1;
    above.wasFetched = below.wasFetched = emptied.wasFetched = true;
    Object.assign(manager, {
      appPeersManager: {isMonoforum: () => false},
      historiesStorage: {},
      searchesStorage: {},
      threadsStorage: {[GROUP_PEER_ID]: {[mid(ROOT)]: above, [mid(100)]: below, [mid(ROOT + 1)]: emptied}}
    });

    manager.markChannelCutoffHistoryCountsUnknown(GROUP_PEER_ID, mid(200), new Set([emptied]));

    expect(above).toMatchObject({count: 1, wasFetched: true});
    expect(below).toMatchObject({count: null, wasFetched: false});
    expect(emptied).toMatchObject({count: null, wasFetched: false});
  });
});
