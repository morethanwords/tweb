import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import SlicedArray from '@helpers/slicedArray';
import {AppMessagesManager, HistoryStorage, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {BotInfo, Document, EphemeralMessage, Message, MessageEntity, Updates} from '@layer';

const CHAT_ID = 777 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);
const BOT_ID = 100 as UserId;
const SELF_ID = 999 as UserId;
const LOCAL_ID_OFFSET = 0x100000000;

function makeHistoryStorage(key: string, count = 0, maxId = 0): HistoryStorage {
  return {
    _maxId: maxId,
    count,
    history: new SlicedArray(),
    type: key.includes('replies') ? 'replies' : 'history',
    key: key as HistoryStorage['key']
  };
}

function makeEphemeralMessage(
  id: number,
  overrides: Partial<EphemeralMessage> = {}
): EphemeralMessage {
  return {
    _: 'ephemeralMessage',
    pFlags: {},
    id,
    from_id: {_: 'peerUser', user_id: BOT_ID},
    peer_id: {_: 'peerChannel', channel_id: CHAT_ID},
    receiver_id: SELF_ID,
    date: Date.now() / 1000 | 0,
    message: `message ${id}`,
    ...overrides
  };
}

function makeManager() {
  const manager = new AppMessagesManager();
  const storage = Object.assign(new Map(), {
    peerId: PEER_ID,
    type: 'history',
    key: `${PEER_ID}_history`
  }) as MessagesStorage;
  const baseHistory = makeHistoryStorage(`history_${PEER_ID}`, 12, LOCAL_ID_OFFSET + 500);
  const threadHistories = new Map<number, HistoryStorage>();
  const historiesStorage = {[PEER_ID]: baseHistory};
  const threadsStorage = {[PEER_ID]: {} as Record<number, HistoryStorage>};
  const dispatchEvent = vi.fn();
  const invokeApi = vi.fn((_method: string, _params?: any, _options?: any) => Promise.resolve(true));
  const log = Object.assign(() => {}, {
    bindPrefix: () => log,
    error: vi.fn()
  });
  let editInputHadTotalEntities: boolean;

  const getPeerId = (peer: any): PeerId => {
    if(typeof(peer) === 'number') {
      return peer;
    }

    if(peer?._ === 'peerUser') {
      return (+peer.user_id as UserId).toPeerId(false);
    }

    return (+peer.channel_id as ChatId).toPeerId(true);
  };

  Object.assign(manager as any, {
    ephemeralMidsByPeerId: new Map(),
    ephemeralOrderByPeerId: new Map(),
    ephemeralOrder: 0,
    pendingEphemeralMessages: new Map(),
    pendingEphemeralRetries: new Map(),
    ephemeralRetryId: 0,
    ephemeralCallbackTopicHints: new Map(),
    tempMids: {},
    historiesStorage,
    threadsStorage,
    appPeersManager: {
      getPeerId,
      getPeerMigratedTo: (): PeerId => undefined,
      getPeerUsername: () => 'helperbot',
      getInputPeerById: () => ({
        _: 'inputPeerChannel',
        channel_id: CHAT_ID,
        access_hash: '1'
      }),
      isAnyGroup: () => true,
      isChannel: () => true,
      isForum: () => true,
      isBotforum: () => false,
      canManageDirectMessages: () => false
    },
    appProfileManager: {
      getCachedBotCommands: (): any => undefined,
      getCachedFullChat: (): any => undefined
    },
    appUsersManager: {
      getUser: (userId: UserId) => ({
        _: 'user',
        pFlags: {bot: userId === BOT_ID},
        id: userId,
        access_hash: '1'
      }),
      getUserInput: (userId: UserId) => ({
        _: 'inputUser',
        user_id: userId,
        access_hash: '1'
      })
    },
    appDraftsManager: {
      clearDraft: vi.fn()
    },
    apiManager: {
      getAppConfig: () => Promise.resolve({}),
      getConfig: () => Promise.resolve({message_length_max: 12}),
      invokeApi
    },
    apiUpdatesManager: {
      processUpdateMessage: vi.fn()
    },
    log,
    timeManager: {
      getServerTimeOffset: () => 0
    },
    rootScope: {
      myId: SELF_ID,
      dispatchEvent
    },
    getHistoryMessagesStorage: () => storage,
    getHistoryStorage: (_peerId: PeerId, threadId?: number) => {
      if(!threadId) {
        return baseHistory;
      }

      let history = threadHistories.get(threadId);
      if(!history) {
        history = makeHistoryStorage(`replies_${PEER_ID}_${threadId}`, 4, threadId);
        threadHistories.set(threadId, history);
        threadsStorage[PEER_ID][threadId] = history;
      }

      return history;
    },
    saveMessage: (message: Message.message, {storage}: {storage: MessagesStorage}) => {
      editInputHadTotalEntities = message.totalEntities !== undefined;
      message.peerId = PEER_ID;
      message.fromId = getPeerId(message.from_id);
      message.mid = message.id;
      message.storageKey = storage.key;
      if(message.reply_to?._ === 'messageReplyHeader') {
        message.reply_to_mid = message.reply_to.reply_to_msg_id;
      }
      message.pFlags.unread = true;
      if(message.entities) {
        message.totalEntities = message.entities.slice();
      }
      storage.set(message.mid, message);
      return message;
    },
    setMessageToStorage: (storage: MessagesStorage, message: Message.message) => {
      storage.set(message.mid, message);
    },
    deleteMessageFromStorage: (storage: MessagesStorage, mid: number) => storage.delete(mid),
    handleEditedMessage: vi.fn(),
    handleReleasingMessage: vi.fn()
  });

  return {
    baseHistory,
    dispatchEvent,
    getEditInputHadTotalEntities: () => editInputHadTotalEntities,
    invokeApi,
    manager: manager as any,
    storage,
    threadHistories
  };
}

describe('AppMessagesManager ephemeral messages', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('keeps the reserved local id namespace out of server ids', () => {
    const mid = EPHEMERAL_MESSAGE_ID_OFFSET + 123;
    expect(new AppMessagesIdsManager().generateMessageId(mid, CHAT_ID)).toBe(mid);
    expect(getServerMessageId(mid)).toBe(0);
  });

  it('keeps an isolated history overlay and resolves out-of-order replies', () => {
    const {
      baseHistory,
      dispatchEvent,
      getEditInputHadTotalEntities,
      manager,
      storage
    } = makeManager();
    const child = makeEphemeralMessage(2, {
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {reply_to_ephemeral: true},
        reply_to_msg_id: 1
      }
    });

    manager.onUpdateNewEphemeralMessage({_: 'updateNewEphemeralMessage', message: child});
    expect(storage.size).toBe(0);

    const target = makeEphemeralMessage(1, {top_msg_id: 42});
    manager.onUpdateNewEphemeralMessage({_: 'updateNewEphemeralMessage', message: target});

    const targetMessage = manager.getEphemeralMessage(PEER_ID, 1);
    const childMessage = manager.getEphemeralMessage(PEER_ID, 2);
    expect(storage.size).toBe(2);
    expect(targetMessage.mid).toBe(EPHEMERAL_MESSAGE_ID_OFFSET + 1);
    expect(childMessage.mid).toBe(EPHEMERAL_MESSAGE_ID_OFFSET + 2);
    expect(manager.isEphemeralMessageId(targetMessage.mid)).toBe(true);
    expect(targetMessage.pFlags.local).toBeUndefined();
    expect(childMessage.reply_to_mid).toBe(targetMessage.mid);
    expect((childMessage.reply_to as any).reply_to_top_id).toBe(42);
    expect(targetMessage.pFlags.unread).toBeUndefined();
    expect(childMessage.pFlags.unread).toBeUndefined();
    expect(baseHistory.count).toBe(12);
    expect(baseHistory._maxId).toBe(LOCAL_ID_OFFSET + 500);
    expect(baseHistory.history.findSlice(targetMessage.mid)).toBeUndefined();

    expect(manager.getEphemeralHistory({peerId: PEER_ID})).toEqual([
      childMessage.mid,
      targetMessage.mid
    ]);
    expect(manager.getEphemeralHistory({
      peerId: PEER_ID,
      threadId: 42
    })).toEqual([childMessage.mid, targetMessage.mid]);
    expect(manager.getEphemeralHistory({
      peerId: PEER_ID,
      limit: 1
    })).toEqual([childMessage.mid]);

    const appendCalls = dispatchEvent.mock.calls.filter(([event]) => event === 'ephemeral_history_append');
    manager.onUpdateNewEphemeralMessage({_: 'updateNewEphemeralMessage', message: target});
    expect(dispatchEvent.mock.calls.filter(([event]) => event === 'ephemeral_history_append')).toHaveLength(appendCalls.length);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'history_append')).toBe(false);

    const oldMid = childMessage.mid;
    const oldDate = childMessage.date;
    const oldFromId = childMessage.fromId;
    const oldReplyTo = childMessage.reply_to;
    const entities: MessageEntity[] = [{
      _: 'messageEntityBold',
      offset: 0,
      length: 6
    }];
    manager.onUpdateEditEphemeralMessage({
      _: 'updateEditEphemeralMessage',
      message: makeEphemeralMessage(2, {
        pFlags: {out: true},
        date: child.date + 100,
        message: 'edited',
        entities,
        top_msg_id: 99
      })
    });

    const editedMessage = manager.getEphemeralMessage(PEER_ID, 2);
    expect(editedMessage.mid).toBe(oldMid);
    expect(editedMessage.date).toBe(oldDate);
    expect(editedMessage.fromId).toBe(oldFromId);
    expect(editedMessage.reply_to).toBe(oldReplyTo);
    expect(editedMessage.message).toBe('edited');
    expect(editedMessage.totalEntities).toEqual(entities);
    expect(getEditInputHadTotalEntities()).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_history_edit', expect.objectContaining({
      peerId: PEER_ID,
      mid: oldMid,
      message: editedMessage
    }));
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'message_edit')).toBe(false);

    manager.onUpdateDeleteEphemeralMessages({
      _: 'updateDeleteEphemeralMessages',
      peer: {_: 'peerChannel', channel_id: CHAT_ID},
      ids: [1, 2]
    });
    expect(storage.size).toBe(0);
    expect(baseHistory.history.findSlice(targetMessage.mid)).toBeUndefined();
    expect(baseHistory.count).toBe(12);
    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_history_delete', {
      peerId: PEER_ID,
      msgs: new Set([targetMessage.mid, childMessage.mid])
    });
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'history_delete')).toBe(false);
  });

  it('orders the overlay by date and then by stable arrival order', () => {
    const {manager} = makeManager();
    const date = Date.now() / 1000 | 0;
    manager.insertEphemeralMessage(makeEphemeralMessage(100, {date}));
    manager.insertEphemeralMessage(makeEphemeralMessage(1, {date: date + 1}));
    manager.insertEphemeralMessage(makeEphemeralMessage(50, {date}));

    expect(manager.getEphemeralMessage(PEER_ID, 100).ephemeral_order).toBeLessThan(
      manager.getEphemeralMessage(PEER_ID, 50).ephemeral_order
    );
    expect(manager.getEphemeralHistory({peerId: PEER_ID})).toEqual([
      EPHEMERAL_MESSAGE_ID_OFFSET + 1,
      EPHEMERAL_MESSAGE_ID_OFFSET + 50,
      EPHEMERAL_MESSAGE_ID_OFFSET + 100
    ]);
  });

  it('gives every unresolved reply its own resolution deadline and preserves pending edits', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T00:00:00Z'));
    const {manager} = makeManager();

    manager.onUpdateNewEphemeralMessage({
      _: 'updateNewEphemeralMessage',
      message: makeEphemeralMessage(10, {
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {reply_to_ephemeral: true},
          reply_to_msg_id: 100
        }
      })
    });
    vi.advanceTimersByTime(1900);
    manager.onUpdateNewEphemeralMessage({
      _: 'updateNewEphemeralMessage',
      message: makeEphemeralMessage(20, {
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {reply_to_ephemeral: true},
          reply_to_msg_id: 200
        }
      })
    });

    vi.advanceTimersByTime(100);
    expect(manager.getEphemeralMessage(PEER_ID, 10)).toBeTruthy();
    expect(manager.getEphemeralMessage(PEER_ID, 10).reply_to).toBeUndefined();
    expect(manager.getEphemeralMessage(PEER_ID, 20)).toBeUndefined();
    vi.advanceTimersByTime(1900);
    expect(manager.getEphemeralMessage(PEER_ID, 20)).toBeTruthy();
    expect(manager.getEphemeralMessage(PEER_ID, 20).reply_to).toBeUndefined();

    manager.onUpdateNewEphemeralMessage({
      _: 'updateNewEphemeralMessage',
      message: makeEphemeralMessage(30, {
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {reply_to_ephemeral: true},
          reply_to_msg_id: 300
        }
      })
    });
    manager.onUpdateEditEphemeralMessage({
      _: 'updateEditEphemeralMessage',
      message: makeEphemeralMessage(30, {
        message: 'edited while pending',
        reply_to: {
          _: 'messageReplyHeader',
          pFlags: {reply_to_ephemeral: true},
          reply_to_msg_id: 300
        }
      })
    });
    manager.onUpdateNewEphemeralMessage({
      _: 'updateNewEphemeralMessage',
      message: makeEphemeralMessage(300)
    });

    const edited = manager.getEphemeralMessage(PEER_ID, 30);
    const target = manager.getEphemeralMessage(PEER_ID, 300);
    expect(edited.message).toBe('edited while pending');
    expect(edited.reply_to_mid).toBe(target.mid);
    expect((edited.reply_to as any).pFlags.reply_to_ephemeral).toBe(true);
  });

  it('sends oversized commands in one private request and drops unsafe replies', async() => {
    const {manager, storage} = makeManager();
    const botInfo: BotInfo.botInfo = {
      _: 'botInfo',
      pFlags: {},
      user_id: BOT_ID,
      commands: [{
        _: 'botCommand',
        pFlags: {ephemeral: true},
        command: 'secret',
        description: 'Secret'
      }]
    };
    manager.appProfileManager.getCachedFullChat = () => ({bot_info: [botInfo]});
    const sendEphemeralMessage = vi.fn(() => Promise.resolve());
    manager.sendEphemeralMessage = sendEphemeralMessage;
    manager.generateOutgoingMessage = vi.fn(() => {
      throw new Error('public send path reached');
    });

    await manager.sendText({
      peerId: PEER_ID,
      text: '/secret a long private payload'
    });
    expect(sendEphemeralMessage).toHaveBeenCalledTimes(1);
    expect(sendEphemeralMessage).toHaveBeenCalledWith(expect.objectContaining({
      receiverId: BOT_ID,
      message: '/secret a long private payload'
    }));

    sendEphemeralMessage.mockClear();
    await manager.sendText({
      peerId: PEER_ID,
      text: '/secret x',
      webPage: {_: 'webPage', url: 'x'} as any,
      webPageOptions: {largeMedia: true}
    });
    expect(sendEphemeralMessage).toHaveBeenCalledWith(expect.objectContaining({
      media: {
        _: 'inputMediaWebPage',
        url: 'x',
        pFlags: expect.objectContaining({force_large_media: true})
      }
    }));

    manager.appProfileManager.getCachedFullChat = (): any => undefined;
    manager.appProfileManager.getCachedBotCommands = () => ({[BOT_ID]: botInfo.commands});
    sendEphemeralMessage.mockClear();
    await manager.sendText({
      peerId: PEER_ID,
      text: '/secret from cached commands'
    });
    expect(sendEphemeralMessage).toHaveBeenCalled();

    sendEphemeralMessage.mockClear();
    await manager.sendText({
      peerId: PEER_ID,
      replyToMsgId: EPHEMERAL_MESSAGE_ID_OFFSET + 999,
      threadId: 42,
      text: '/secret stale topic reply'
    });
    expect(sendEphemeralMessage).not.toHaveBeenCalled();

    sendEphemeralMessage.mockClear();
    await manager.sendText({
      peerId: PEER_ID,
      text: '/secret scheduled',
      scheduleDate: 123
    });
    expect(sendEphemeralMessage).not.toHaveBeenCalled();

    await expect(manager.sendText({
      peerId: PEER_ID,
      text: '/secret inline result',
      forceOrdinary: true
    })).rejects.toThrow('public send path reached');
    expect(sendEphemeralMessage).not.toHaveBeenCalled();

    const outgoing: Message.message = {
      _: 'message',
      pFlags: {out: true, ephemeral: true},
      id: LOCAL_ID_OFFSET + 1.0001,
      mid: LOCAL_ID_OFFSET + 1.0001,
      peerId: PEER_ID,
      fromId: SELF_ID.toPeerId(false),
      from_id: {_: 'peerUser', user_id: SELF_ID},
      peer_id: {_: 'peerChannel', channel_id: CHAT_ID},
      date: Date.now() / 1000 | 0,
      message: 'outgoing',
      ephemeral_id: 50,
      ephemeral_receiver_id: BOT_ID
    };
    storage.set(outgoing.mid, outgoing);
    await manager.sendText({
      peerId: PEER_ID,
      replyToMsgId: outgoing.mid,
      text: 'must not leak'
    });
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
  });

  it('fails closed for ambiguous ephemeral commands', async() => {
    const {dispatchEvent, manager} = makeManager();
    const commands: BotInfo.botInfo['commands'] = [{
      _: 'botCommand',
      pFlags: {ephemeral: true},
      command: 'secret',
      description: 'Secret'
    }];
    manager.appProfileManager.getCachedFullChat = () => ({
      bot_info: [{
        _: 'botInfo',
        pFlags: {},
        user_id: BOT_ID,
        commands
      }, {
        _: 'botInfo',
        pFlags: {},
        user_id: 101 as UserId,
        commands
      }]
    });
    manager.generateOutgoingMessage = vi.fn(() => {
      throw new Error('ordinary send path reached');
    });
    const sendEphemeralMessage = vi.fn(() => Promise.resolve());
    manager.sendEphemeralMessage = sendEphemeralMessage;

    await expect(manager.sendText({
      peerId: PEER_ID,
      text: '/secret must stay private'
    })).resolves.toBeUndefined();
    expect(manager.generateOutgoingMessage).not.toHaveBeenCalled();
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_send_blocked', {
      peerId: PEER_ID,
      reason: 'ambiguous'
    });
  });

  it('fails closed for stale command caches and private replies when the bot user is missing', async() => {
    const {dispatchEvent, manager} = makeManager();
    const commands: BotInfo.botInfo['commands'] = [{
      _: 'botCommand',
      pFlags: {ephemeral: true},
      command: 'secret',
      description: 'Secret'
    }];
    manager.appProfileManager.getCachedBotCommands = () => ({[BOT_ID]: commands});
    manager.appUsersManager.getUser = (): undefined => undefined;
    manager.generateOutgoingMessage = vi.fn(() => {
      throw new Error('ordinary send path reached');
    });
    const sendEphemeralMessage = vi.fn(() => Promise.resolve());
    manager.sendEphemeralMessage = sendEphemeralMessage;

    await expect(manager.sendText({
      peerId: PEER_ID,
      text: '/secret stale cache'
    })).resolves.toBeUndefined();
    expect(manager.generateOutgoingMessage).not.toHaveBeenCalled();
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_send_blocked', {
      peerId: PEER_ID,
      reason: 'unavailable'
    });

    dispatchEvent.mockClear();
    manager.insertEphemeralMessage(makeEphemeralMessage(55));
    await expect(manager.sendText({
      peerId: PEER_ID,
      replyToMsgId: EPHEMERAL_MESSAGE_ID_OFFSET + 55,
      text: 'must stay private'
    })).resolves.toBeUndefined();
    expect(manager.generateOutgoingMessage).not.toHaveBeenCalled();
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_send_blocked', {
      peerId: PEER_ID,
      reason: 'unavailable'
    });
  });

  it('retries a failed ephemeral send with the same random id', async() => {
    const {dispatchEvent, manager} = makeManager();
    const error = {type: 'TIMEOUT'} as ApiError;
    const updates: Updates.updates = {_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0};
    const invokeApi = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(updates);
    manager.apiManager.invokeApi = invokeApi;

    await expect(manager.sendEphemeralMessage({
      peerId: PEER_ID,
      receiverId: BOT_ID,
      randomId: '123',
      message: 'private'
    })).rejects.toEqual(error);

    const errorEvent = dispatchEvent.mock.calls.find(([event]) => event === 'ephemeral_send_error');
    expect(errorEvent).toBeTruthy();
    await manager.retryEphemeralMessage(errorEvent[1].retryId);

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(invokeApi).toHaveBeenNthCalledWith(1, 'ephemeral.sendMessage', expect.objectContaining({
      random_id: '123'
    }));
    expect(invokeApi).toHaveBeenNthCalledWith(2, 'ephemeral.sendMessage', expect.objectContaining({
      random_id: '123'
    }));
    expect(manager.apiUpdatesManager.processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(manager.pendingEphemeralRetries.size).toBe(0);
  });

  it('restarts a file upload that failed before the ephemeral API call', async() => {
    const {dispatchEvent, manager} = makeManager();
    const options = {
      peerId: PEER_ID,
      ephemeral: true,
      ephemeralReceiverId: BOT_ID,
      file: new Blob(['retry'])
    };
    const sendFile = vi.fn(() => Promise.resolve({}));
    manager.sendFile = sendFile;

    manager.registerEphemeralRetry(PEER_ID, {
      type: 'file',
      options
    });
    const errorEvent = dispatchEvent.mock.calls.find(([event]) => event === 'ephemeral_send_error');
    await manager.retryEphemeralMessage(errorEvent[1].retryId);

    expect(sendFile).toHaveBeenCalledWith(options);
    expect(manager.pendingEphemeralRetries.size).toBe(0);
  });

  it('does not duplicate retry actions when a restarted file upload fails again', async() => {
    const {dispatchEvent, manager} = makeManager();
    const error = {type: 'TIMEOUT'} as ApiError;
    const options = {
      peerId: PEER_ID,
      ephemeral: true,
      ephemeralReceiverId: BOT_ID,
      file: new Blob(['retry'])
    };
    manager.sendFile = vi.fn((retryOptions: typeof options) => {
      manager.registerEphemeralRetry(PEER_ID, {
        type: 'file',
        options: retryOptions
      });
      return Promise.reject(error);
    });

    manager.registerEphemeralRetry(PEER_ID, {
      type: 'file',
      options
    });
    const errorEvents = () => dispatchEvent.mock.calls.filter(([event]) => event === 'ephemeral_send_error');
    const retryId = errorEvents()[0][1].retryId;

    await expect(manager.retryEphemeralMessage(retryId)).rejects.toEqual(error);

    expect(manager.pendingEphemeralRetries.size).toBe(1);
    expect(errorEvents()).toHaveLength(2);
  });

  it('preserves explicit ephemeral intent when a shortcut replaces the command text', async() => {
    const {manager} = makeManager();
    const sendEphemeralMessage = vi.fn(() => Promise.resolve());
    manager.sendEphemeralMessage = sendEphemeralMessage;
    manager.generateOutgoingMessage = vi.fn(() => {
      throw new Error('public send path reached');
    });

    await manager.sendOther({
      peerId: PEER_ID,
      ephemeral: true,
      ephemeralReceiverId: BOT_ID,
      inputMedia: {
        _: 'inputMediaGeoPoint',
        geo_point: {_: 'inputGeoPoint', lat: 1, long: 2}
      }
    });

    expect(sendEphemeralMessage).toHaveBeenCalledWith(expect.objectContaining({
      peerId: PEER_ID,
      receiverId: BOT_ID,
      message: '',
      media: expect.objectContaining({_: 'inputMediaGeoPoint'})
    }));
    expect(manager.generateOutgoingMessage).not.toHaveBeenCalled();

    sendEphemeralMessage.mockClear();
    manager.appUsersManager.getUser = (): undefined => undefined;
    await manager.sendOther({
      peerId: PEER_ID,
      ephemeral: true,
      ephemeralReceiverId: BOT_ID,
      inputMedia: {
        _: 'inputMediaGeoPoint',
        geo_point: {_: 'inputGeoPoint', lat: 1, long: 2}
      }
    });
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
    expect(manager.generateOutgoingMessage).not.toHaveBeenCalled();
  });

  it('strips unsupported and stale ephemeral replies before ordinary sends', () => {
    const {manager} = makeManager();
    manager.insertEphemeralMessage(makeEphemeralMessage(60));
    const message = manager.getEphemeralMessage(PEER_ID, 60);
    const options = {
      peerId: PEER_ID,
      replyToMsgId: message.mid,
      replyTo: manager.getInputReplyTo({
        peerId: PEER_ID,
        replyToMsgId: message.mid
      }),
      replyToQuote: {text: 'quote'},
      replyToPollOption: new Uint8Array([1]),
      replyToPeerId: BOT_ID.toPeerId(false),
      threadId: 42
    };

    expect(options.replyTo._).toBe('inputReplyToEphemeralMessage');
    expect(manager.stripEphemeralReply(options)).toBe(true);
    expect(options).toEqual(expect.objectContaining({
      peerId: PEER_ID,
      replyToMsgId: undefined,
      replyTo: undefined,
      replyToQuote: undefined,
      replyToPollOption: undefined,
      replyToPeerId: undefined,
      threadId: 42
    }));
    expect(manager.getInputReplyTo({
      peerId: PEER_ID,
      replyToMsgId: EPHEMERAL_MESSAGE_ID_OFFSET + 999
    })).toBeUndefined();
  });

  it('rebuilds a stale ephemeral reply as a topic-root reply before sending', async() => {
    const {manager} = makeManager();
    const options = {
      peerId: PEER_ID,
      replyToMsgId: EPHEMERAL_MESSAGE_ID_OFFSET + 999,
      replyToQuote: {text: 'stale'},
      threadId: 42
    };

    await manager.checkSendOptions(options);

    expect(options).toEqual(expect.objectContaining({
      replyToMsgId: 42,
      replyToQuote: undefined,
      threadId: 42,
      replyTo: expect.objectContaining({
        _: 'inputReplyToMessage',
        reply_to_msg_id: 42,
        top_msg_id: 42
      })
    }));
  });

  it('keeps only the first attachment from an ephemeral media batch', async() => {
    const {invokeApi, manager} = makeManager();
    manager.insertEphemeralMessage(makeEphemeralMessage(70));
    manager.checkSendOptions = async(options: any) => {
      options.replyTo ??= manager.getInputReplyTo(options);
      return {config: {}, appConfig: {}};
    };
    let randomId = 0;
    manager.sendFile = vi.fn(async(options: any) => {
      const id = '' + ++randomId;
      return {
        message: {id: +id, random_id: id},
        send: async() => ({
          _: 'inputMediaGeoPoint',
          geo_point: {_: 'inputGeoPoint', lat: +id, long: +id}
        }),
        uploadingFileName: `file-${id}`
      };
    });
    manager.setTyping = vi.fn();
    manager.sendSmthLazyLoadQueue = {
      push: ({load}: {load: () => Promise<unknown>}): void => {
        void load();
      }
    };
    const sendEphemeralMessage = vi.fn(() => Promise.resolve());
    manager.sendEphemeralMessage = sendEphemeralMessage;

    await manager.sendGrouped({
      peerId: PEER_ID,
      caption: 'private album',
      replyTo: {
        _: 'inputReplyToEphemeralMessage',
        id: 70
      },
      sendFileDetails: [
        {file: new Blob(['one'])},
        {file: new Blob(['two'])}
      ]
    });

    expect(manager.sendFile).toHaveBeenCalledTimes(1);
    expect(manager.sendFile).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.any(Blob),
      replyTo: {
        _: 'inputReplyToEphemeralMessage',
        id: 70
      }
    }));
    expect(sendEphemeralMessage).not.toHaveBeenCalled();
    expect(invokeApi.mock.calls.filter(([method]) => method === 'messages.sendMultiMedia')).toHaveLength(0);
  });

  it('drops albums initiated by an ephemeral command', async() => {
    const {invokeApi, manager} = makeManager();
    const commands: BotInfo.botInfo['commands'] = [{
      _: 'botCommand',
      pFlags: {ephemeral: true},
      command: 'secret',
      description: 'Secret'
    }];
    manager.appProfileManager.getCachedBotCommands = () => ({[BOT_ID]: commands});
    manager.sendFile = vi.fn();

    await manager.sendGrouped({
      peerId: PEER_ID,
      caption: '/secret album',
      sendFileDetails: [
        {file: new Blob(['one'])},
        {file: new Blob(['two'])}
      ]
    });

    expect(manager.sendFile).not.toHaveBeenCalled();
    expect(invokeApi).not.toHaveBeenCalled();
  });

  it('does not leak ephemeral media failures into ordinary message storage or events', async() => {
    const {dispatchEvent, manager, storage} = makeManager();
    manager.insertEphemeralMessage(makeEphemeralMessage(80));
    const storageSize = storage.size;
    const error = {type: 'MESSAGE_ID_INVALID'} as ApiError;
    const messagePromise = {
      reject: vi.fn(),
      resolve: vi.fn()
    };
    const outgoingMessage: Message.message = {
      _: 'message',
      pFlags: {out: true},
      id: LOCAL_ID_OFFSET + 1.5,
      from_id: {_: 'peerUser', user_id: SELF_ID},
      peer_id: {_: 'peerChannel', channel_id: CHAT_ID},
      date: Date.now() / 1000 | 0,
      message: '',
      random_id: '123',
      promise: messagePromise as any
    };
    const document: Document.document = {
      _: 'document',
      pFlags: {},
      id: '10',
      access_hash: '20',
      file_reference: new Uint8Array(),
      date: 0,
      mime_type: 'application/octet-stream',
      size: 1,
      dc_id: 1,
      attributes: []
    };
    const onMessagesSendError = vi.fn();

    manager.checkSendOptions = async(options: any) => {
      options.replyTo ??= manager.getInputReplyTo(options);
      return {config: {}, appConfig: {}};
    };
    manager.generateOutgoingMessage = () => outgoingMessage;
    manager.appDocsManager = {
      getDoc: () => document
    };
    manager.makeDocumentAndMetaForSendingFile = (): any => ({
      document,
      apiFileName: '',
      actionName: undefined,
      photo: undefined,
      fileType: document.mime_type,
      mediaUnread: false,
      attributes: [],
      attachType: 'document'
    });
    manager.apiFileManager = {
      invokeApiWithReference: ({callback}: {callback: () => Promise<unknown>}) => callback()
    };
    manager.setTyping = vi.fn();
    manager.beforeMessageSending = (message: Message.message, options: {noOutgoingMessage?: boolean}) => {
      expect(options.noOutgoingMessage).toBe(true);
      message.send();
    };
    manager.onMessagesSendError = onMessagesSendError;

    const rejectedThenable = {
      catch: (callback: (error: ApiError) => unknown) => {
        try {
          callback(error);
        } catch(err) {
          expect(err).toBe(error);
        }

        return Promise.resolve();
      }
    };
    manager.sendEphemeralMessage = vi.fn(() => ({
      then: () => rejectedThenable
    }));

    await manager.sendFile({
      peerId: PEER_ID,
      file: document,
      replyTo: {
        _: 'inputReplyToEphemeralMessage',
        id: 80
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onMessagesSendError).not.toHaveBeenCalled();
    expect(storage.size).toBe(storageSize);
    expect((storage as Map<unknown, unknown>).has(undefined)).toBe(false);
    expect(dispatchEvent.mock.calls.some(([event]) => (
      event === 'message_error' ||
      event === 'messages_pending' ||
      event === 'history_append'
    ))).toBe(false);
  });

  it('uses the ephemeral edit event namespace for indirect message mutations', () => {
    const {dispatchEvent, manager} = makeManager();
    manager.insertEphemeralMessage(makeEphemeralMessage(90));
    const message = manager.getEphemeralMessage(PEER_ID, 90);
    dispatchEvent.mockClear();

    manager.dispatchMessageEditEvent(message);

    expect(dispatchEvent).toHaveBeenCalledWith('ephemeral_history_edit', {
      storageKey: message.storageKey,
      peerId: PEER_ID,
      mid: message.mid,
      message
    });
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'message_edit')).toBe(false);
  });

  it('uses raw ephemeral ids and the stored receiver for callback, report and delete', async() => {
    const {invokeApi, manager} = makeManager();
    manager.insertEphemeralMessage(makeEphemeralMessage(7, {top_msg_id: 42}));
    const message = manager.getEphemeralMessage(PEER_ID, 7);

    await manager.getEphemeralCallbackAnswer(PEER_ID, message.mid, new Uint8Array([1]));
    await manager.reportEphemeralMessage(PEER_ID, message.mid, new Uint8Array([2]), 'reason');
    await manager.deleteEphemeralMessage(PEER_ID, message.mid);

    expect(invokeApi).toHaveBeenNthCalledWith(1, 'ephemeral.getCallbackAnswer', expect.objectContaining({
      id: 7
    }), expect.anything());
    expect(invokeApi).toHaveBeenNthCalledWith(2, 'ephemeral.reportMessage', expect.objectContaining({
      id: 7
    }));
    expect(invokeApi).toHaveBeenNthCalledWith(3, 'ephemeral.deleteMessage', expect.objectContaining({
      id: 7,
      receiver_id: expect.objectContaining({user_id: SELF_ID})
    }));
    expect(invokeApi.mock.calls.some(([method]) => method.startsWith('messages.'))).toBe(false);

    manager.insertEphemeralMessage(makeEphemeralMessage(8, {
      pFlags: {out: true},
      from_id: {_: 'peerUser', user_id: SELF_ID},
      receiver_id: BOT_ID
    }));
    manager.appUsersManager.getUser = (): undefined => undefined;
    await manager.deleteEphemeralMessage(PEER_ID, EPHEMERAL_MESSAGE_ID_OFFSET + 8);
    expect(manager.getEphemeralMessage(PEER_ID, 8)).toBeUndefined();
    expect(invokeApi).toHaveBeenCalledTimes(3);
  });
});
