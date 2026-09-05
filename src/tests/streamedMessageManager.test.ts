import {Message, RichMessage, SendMessageAction, Update} from '@layer';
import {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import {AppMessagesManager, HistoryStorage, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {GENERAL_TOPIC_ID} from '@appManagers/constants';
import '@helpers/peerIdPolyfill';

const peerId = 10 as PeerId;
const authorId = 10 as PeerId;

function makeHistoryStorage(key: string) {
  const mids: number[] = [];
  const history = {
    unshift: vi.fn((mid: number) => mids.unshift(mid)),
    delete: vi.fn((mid: number) => {
      const index = mids.indexOf(mid);
      if(index !== -1) mids.splice(index, 1);
      return index !== -1;
    }),
    findSlice: (mid: number) => mids.includes(mid) ? mids : undefined
  };

  return {
    key,
    type: 'history',
    history,
    count: 42,
    _maxId: 0,
    mids
  } as unknown as HistoryStorage & {mids: number[]};
}

function makeHarness(options: {isBotforum?: boolean, isForum?: boolean} = {}) {
  const manager = new AppMessagesManager() as any;
  const dispatchEvent = vi.fn();
  const deleteContext = vi.fn();
  const deleteCacheContext = vi.fn();
  const storage = new Map() as MessagesStorage;
  storage.peerId = peerId;
  storage.type = 'history';
  storage.key = `${peerId}_history`;
  const mainHistory = makeHistoryStorage('history_10');
  const threadHistory = makeHistoryStorage('replies_10_7');
  let nextTempMessageId = 1.0001;
  const generateTempMessageId = vi.fn(() => {
    const result = nextTempMessageId;
    nextTempMessageId = +(nextTempMessageId + 0.0001).toFixed(4);
    return result;
  });

  Object.assign(manager, {
    rootScope: {dispatchEvent},
    appPeersManager: {
      peerId: 999 as PeerId,
      getPeerId(value: any) {
        if(value._ === 'updateUserTyping') return value.user_id as PeerId;
        if(value._ === 'updateChatUserTyping') return (-value.chat_id) as PeerId;
        if(value._ === 'updateChannelUserTyping') return (-value.channel_id) as PeerId;
        if(value._ === 'peerUser') return value.user_id as PeerId;
        if(value._ === 'peerChat') return (-value.chat_id) as PeerId;
        if(value._ === 'peerChannel') return (-value.channel_id) as PeerId;
        return 0 as PeerId;
      },
      getOutputPeer(id: PeerId) {
        return id < 0 ?
          {_: 'peerChannel', channel_id: -id} :
          {_: 'peerUser', user_id: id};
      },
      isBotforum: (id: PeerId) => options.isBotforum !== false && id === peerId
    },
    appMessagesIdsManager: {
      generateMessageId: (id: number, channelId?: number) => channelId ? 1_000_000 + id : id
    },
    appChatsManager: {isForum: () => !!options.isForum},
    timeManager: {getServerTimeOffset: () => 0},
    referencesStorage: {deleteContext},
    thumbsStorage: {deleteCacheContext},
    messagesStorageByPeerId: {[peerId]: storage},
    historiesStorage: {[peerId]: mainHistory},
    threadsStorage: {[peerId]: {7: threadHistory}},
    getHistoryMessagesStorage: () => storage,
    getHistoryStorage: (_peerId: PeerId, threadId?: number) => threadId ? threadHistory : mainHistory,
    generateTempMessageId,
    saveMessages(messages: Message.message[]) {
      return messages.map((raw) => {
        const message = {
          ...raw,
          pFlags: {...raw.pFlags, unread: true},
          mid: raw.id,
          peerId,
          fromId: raw.from_id && raw.from_id._ === 'peerUser' ? raw.from_id.user_id as PeerId : peerId
        } as Message.message;
        storage.set(message.mid, message);
        return message;
      });
    },
    deleteMessageFromStorage(messagesStorage: MessagesStorage, mid: number) {
      return messagesStorage.delete(mid);
    }
  });

  return {
    manager,
    dispatchEvent,
    storage,
    mainHistory,
    threadHistory,
    generateTempMessageId,
    deleteContext,
    deleteCacheContext
  };
}

function textAction(value: string, randomId = '100'): SendMessageAction.sendMessageTextDraftAction {
  return {
    _: 'sendMessageTextDraftAction',
    random_id: randomId,
    text: {_: 'textWithEntities', text: value, entities: []}
  };
}

function richAction(value: string, randomId = '100'): SendMessageAction.sendMessageRichMessageDraftAction {
  const richMessage: RichMessage = {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: value}}],
    photos: [],
    documents: []
  };
  return {_: 'sendMessageRichMessageDraftAction', random_id: randomId, rich_message: richMessage};
}

function userTyping(action: SendMessageAction, threadId = 7): Update.updateUserTyping {
  return {_: 'updateUserTyping', user_id: peerId as UserId, top_msg_id: threadId, action};
}

describe('AppMessagesManager streamed drafts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('publishes immutable text revisions without entering the outgoing pending lifecycle', () => {
    const {manager, dispatchEvent, storage, mainHistory, threadHistory, generateTempMessageId} = makeHarness();

    expect(manager.handleStreamedMessageTypingUpdate(userTyping(textAction('hel')))).toBe(true);
    const firstPayload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];
    expect(firstPayload.initial).toBe(true);
    expect(firstPayload.draft.revision).toBe(1);
    expect(firstPayload.message.message).toBe('hel');
    expect(firstPayload.message.pFlags.unread).toBeUndefined();
    expect(mainHistory.count).toBe(42);
    expect(threadHistory.count).toBe(42);
    expect(manager.pendingByRandomId).toEqual({});
    expect(dispatchEvent.mock.calls.map(([event]) => event)).toEqual(['streamed_message_update']);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'history_append')).toBe(false);

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(userTyping(textAction('hello')))).toBe(true);
    const secondPayload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];
    expect(secondPayload.initial).toBe(false);
    expect(secondPayload.draft.key).toBe(firstPayload.draft.key);
    expect(secondPayload.draft.tempId).toBe(firstPayload.draft.tempId);
    expect(secondPayload.draft.revision).toBe(2);
    expect(firstPayload.draft.content.text.text).toBe('hel');
    expect((storage.get(1.0001) as Message.message).message).toBe('hello');
    expect(generateTempMessageId).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls.map(([event]) => event)).toEqual(['streamed_message_update']);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'message_edit')).toBe(false);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'message_sent')).toBe(false);
  });

  test('accepts rich drafts and all typing update locations with scoped supersede', () => {
    const {manager, dispatchEvent} = makeHarness();
    const rich = richAction('Rich stream');

    manager.handleStreamedMessageTypingUpdate(userTyping(rich));
    const richPayload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];
    expect(richPayload.message.message).toBe('');
    expect(richPayload.message.rich_message.blocks[0]._).toBe('pageBlockParagraph');

    dispatchEvent.mockClear();
    const channelUpdate: Update.updateChannelUserTyping = {
      _: 'updateChannelUserTyping',
      channel_id: 50,
      top_msg_id: 9,
      from_id: {_: 'peerUser', user_id: 25},
      action: textAction('channel', '200')
    };
    expect(manager.handleStreamedMessageTypingUpdate(channelUpdate)).toBe(true);
    const channelPayload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];
    expect(channelPayload.draft.peerId).toBe(-50);
    expect(channelPayload.draft.authorId).toBe(25);
    expect(channelPayload.draft.threadId).toBe(1_000_009);

    const chatUpdate: Update.updateChatUserTyping = {
      _: 'updateChatUserTyping',
      chat_id: 60,
      from_id: {_: 'peerUser', user_id: 26},
      action: textAction('chat', '300')
    };
    expect(manager.handleStreamedMessageTypingUpdate(chatUpdate)).toBe(true);
  });

  test('keeps rich draft snapshots immutable while saveMessage normalizes its working copy', () => {
    const {manager, dispatchEvent} = makeHarness();
    const action = richAction('Rich stream');
    const photo = {_: 'photo', id: 'photo', file_reference: [1], sizes: []} as any;
    action.rich_message.photos = [photo];
    manager.processRichMessage = vi.fn((richMessage: RichMessage) => {
      richMessage.photos[0] = {...richMessage.photos[0], normalized: true} as any;
      return richMessage;
    });
    const saveMessages = manager.saveMessages.bind(manager);
    manager.saveMessages = (messages: Message.message[]) => {
      messages.forEach((message) => {
        if(message.rich_message) {
          message.rich_message = manager.processRichMessage(message.rich_message);
        }
      });
      return saveMessages(messages);
    };

    manager.handleStreamedMessageTypingUpdate(userTyping(action));
    const payload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];

    expect(payload.message.rich_message.photos[0]).toEqual(expect.objectContaining({normalized: true}));
    expect(payload.draft.content.richMessage.photos[0]).toEqual(photo);
    expect(payload.draft.content.richMessage.photos[0]).not.toHaveProperty('normalized');
    expect(action.rich_message.photos[0]).toBe(photo);
  });

  test('releases removed rich media on draft revision, supersede and finalization', () => {
    const {manager, storage, deleteContext} = makeHarness();
    const first = richAction('first');
    const firstReference = [1];
    first.rich_message.photos = [{
      _: 'photo',
      id: 'first-photo',
      file_reference: firstReference,
      sizes: []
    } as any];
    manager.handleStreamedMessageTypingUpdate(userTyping(first));

    manager.handleStreamedMessageTypingUpdate(userTyping(richAction('first revision')));
    expect(deleteContext).toHaveBeenCalledWith(firstReference, {
      type: 'messageRich',
      peerId,
      messageId: 1.0001
    });

    const second = richAction('second', '200');
    const secondReference = [2];
    second.rich_message.documents = [{
      _: 'document',
      id: 'second-document',
      file_reference: secondReference,
      attributes: []
    } as any];
    manager.handleStreamedMessageTypingUpdate(userTyping(second));
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('replacement', '300')));
    expect(deleteContext).toHaveBeenCalledWith(secondReference, {
      type: 'messageRich',
      peerId,
      messageId: 1.0002
    });

    const finalDraft = richAction('final stream', '400');
    const finalReference = [3];
    finalDraft.rich_message.photos = [{
      _: 'photo',
      id: 'final-photo',
      file_reference: finalReference,
      sizes: []
    } as any];
    manager.handleStreamedMessageTypingUpdate(userTyping(finalDraft));
    const finalMessage = {
      _: 'message',
      id: 99,
      mid: 99,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: '',
      rich_message: richAction('final stream complete').rich_message,
      reply_to: storage.get(1.0004).reply_to
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(deleteContext).toHaveBeenCalledWith(finalReference, {
      type: 'messageRich',
      peerId,
      messageId: 1.0004
    });
  });

  test('ordinary cancel leaves the draft alive while supersede and expiry remove only the scoped transient', () => {
    const {manager, dispatchEvent, storage, mainHistory, threadHistory} = makeHarness();
    (manager as any).setStreamedMessageDraftTtl({message_typing_draft_ttl: 1});

    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('first', '100')));
    dispatchEvent.mockClear();
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('second', '200')));
    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_remove',
      expect.objectContaining({reason: 'superseded'})
    );
    expect(storage.has(1.0001)).toBe(false);
    expect(storage.has(1.0002)).toBe(true);
    expect(mainHistory.count).toBe(42);
    expect(threadHistory.count).toBe(42);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'history_delete')).toBe(false);

    dispatchEvent.mockClear();
    const cancel: Update.updateUserTyping = userTyping({_: 'sendMessageCancelAction'});
    expect(manager.handleStreamedMessageTypingUpdate(cancel)).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(storage.has(1.0002)).toBe(true);
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'message_sent')).toBe(false);

    dispatchEvent.mockClear();
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('expires', '300')));
    dispatchEvent.mockClear();
    vi.advanceTimersByTime(1_000);
    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_remove',
      expect.objectContaining({reason: 'expired'})
    );
    expect(dispatchEvent.mock.calls.some(([event]) => event === 'history_delete')).toBe(false);
    expect(mainHistory.count).toBe(42);
    expect(threadHistory.count).toBe(42);
  });

  test('peer cleanup removes its streamed draft and releases its transient message', () => {
    const {manager, dispatchEvent, storage} = makeHarness();
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('will be cleared')));
    dispatchEvent.mockClear();

    (manager as any).clearStreamedMessageDraftsForPeer(peerId);

    expect(storage.has(1.0001)).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_remove',
      expect.objectContaining({reason: 'clear'})
    );
  });

  test('difference replay clears an exact live draft and never revives an absent one', () => {
    const {manager, dispatchEvent, storage} = makeHarness();
    const update = userTyping(textAction('stale'));
    manager.handleStreamedMessageTypingUpdate(update);

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(update, true)).toBe(true);
    expect(storage.has(1.0001)).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_remove',
      expect.objectContaining({reason: 'cancelled'})
    );

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(update, true)).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('a stale difference replay cannot clear the replacement draft in the same scope', () => {
    const {manager, dispatchEvent, storage} = makeHarness();
    const stale = userTyping(textAction('old', '100'));
    manager.handleStreamedMessageTypingUpdate(stale);
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('current', '200')));

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(stale, true)).toBe(true);
    expect(storage.has(1.0001)).toBe(false);
    expect((storage.get(1.0002) as Message.message).message).toBe('current');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('a stale difference revision cannot clear newer content with the same random id', () => {
    const {manager, dispatchEvent, storage} = makeHarness();
    const stale = userTyping(textAction('old', '100'));
    manager.handleStreamedMessageTypingUpdate(stale);
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('new content', '100')));

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(stale, true)).toBe(true);
    expect((storage.get(1.0001) as Message.message).message).toBe('new content');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('a cancel replayed from a difference is left to the ordinary typing lifecycle', () => {
    const {manager, dispatchEvent, storage} = makeHarness();
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('current', '200')));

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(
      userTyping({_: 'sendMessageCancelAction'}),
      true
    )).toBe(false);
    expect((storage.get(1.0001) as Message.message).message).toBe('current');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('adopts only a matching final message and dispatches finalize before the legacy history adapter', () => {
    const {manager, dispatchEvent, storage, mainHistory, threadHistory} = makeHarness();
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('hello')));
    const tempMessage = storage.get(1.0001);
    expect(tempMessage).toBeTruthy();

    const unrelated = {
      _: 'message',
      id: 98,
      mid: 98,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: 'unrelated',
      entities: [],
      reply_to: tempMessage.reply_to
    } as Message.message;
    dispatchEvent.mockClear();
    (manager as any).adoptStreamedMessageDraft(unrelated);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(storage.has(1.0001)).toBe(true);

    const finalMessage = {...unrelated, id: 99, mid: 99, message: 'hello world'};
    storage.set(finalMessage.mid, finalMessage);
    (manager as any).adoptStreamedMessageDraft(finalMessage);

    const events = dispatchEvent.mock.calls.map(([event]) => event);
    expect(events).toEqual(['streamed_message_finalize', 'history_update']);
    expect(dispatchEvent.mock.calls[0][1]).toEqual(expect.objectContaining({
      tempId: 1.0001,
      finalMessage
    }));
    expect(storage.has(1.0001)).toBe(false);
    expect(storage.get(99)).toBe(finalMessage);
    expect(mainHistory.count).toBe(42);
    expect(threadHistory.count).toBe(42);

    dispatchEvent.mockClear();
    expect(manager.handleStreamedMessageTypingUpdate(userTyping(textAction('hello', '100')))).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(storage.has(1.0002)).toBe(false);

    vi.advanceTimersByTime(30_000);
    expect(manager.handleStreamedMessageTypingUpdate(userTyping(textAction('new stream', '100')))).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_update',
      expect.objectContaining({initial: true})
    );
  });

  test('adopts a regular reply in a non-forum chat from the unthreaded draft scope', () => {
    const {manager, dispatchEvent, storage} = makeHarness({isBotforum: false});
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('reply'), 0));

    const finalMessage = {
      _: 'message',
      id: 100,
      mid: 100,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: 'reply complete',
      entities: [],
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {},
        reply_to_msg_id: 55
      }
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    dispatchEvent.mockClear();

    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_finalize',
      expect.objectContaining({tempId: 1.0001, finalMessage})
    );
    expect(storage.has(1.0001)).toBe(false);
  });

  test('adopts a plain reply against the thread the typing updates scoped it to', () => {
    // Desktop resolves an incoming message against the topic root and then the plain reply
    // target (HistoryStreamedDrafts::ThreadRootIds). Without that second scope a stream whose
    // typing updates carried top_msg_id, but whose final message only reports reply_to_msg_id,
    // leaves its draft behind and the bubble is shown twice until the draft expires.
    const {manager, dispatchEvent, storage} = makeHarness({isBotforum: false});
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('scoped'), 7));

    const finalMessage = {
      _: 'message',
      id: 102,
      mid: 102,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: 'scoped complete',
      entities: [],
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {},
        reply_to_msg_id: 7
      }
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    dispatchEvent.mockClear();

    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_finalize',
      expect.objectContaining({tempId: 1.0001, finalMessage})
    );
    expect(storage.has(1.0001)).toBe(false);
  });

  test('leaves a draft alone when the plain reply target belongs to another peer', () => {
    const {manager, dispatchEvent, storage} = makeHarness({isBotforum: false});
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('scoped'), 7));

    const finalMessage = {
      _: 'message',
      id: 103,
      mid: 103,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: 'scoped complete',
      entities: [],
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {},
        reply_to_msg_id: 7,
        reply_to_peer_id: {_: 'peerUser', user_id: 77}
      }
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    dispatchEvent.mockClear();

    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(dispatchEvent).not.toHaveBeenCalledWith(
      'streamed_message_finalize',
      expect.anything()
    );
    expect(storage.has(1.0001)).toBe(true);
  });

  test('trusts a final forum-topic reply when the cached forum flag is stale', () => {
    const {manager, dispatchEvent, storage} = makeHarness({isBotforum: false});
    manager.handleStreamedMessageTypingUpdate(userTyping(textAction('topic reply'), 7));

    const finalMessage = {
      _: 'message',
      id: 101,
      mid: 101,
      peer_id: {_: 'peerUser', user_id: peerId},
      peerId,
      from_id: {_: 'peerUser', user_id: authorId},
      fromId: authorId,
      pFlags: {},
      date: 1_000,
      message: 'topic reply complete',
      entities: [],
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {forum_topic: true},
        reply_to_top_id: 7,
        reply_to_msg_id: 55
      }
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    dispatchEvent.mockClear();

    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_finalize',
      expect.objectContaining({tempId: 1.0001, finalMessage})
    );
    expect(storage.has(1.0001)).toBe(false);
  });

  test('uses the General topic identity for a forum draft without top_msg_id and adopts its final', () => {
    const {manager, dispatchEvent, storage, mainHistory, threadHistory} = makeHarness({
      isBotforum: false,
      isForum: true
    });
    const update: Update.updateChannelUserTyping = {
      _: 'updateChannelUserTyping',
      channel_id: 50,
      from_id: {_: 'peerUser', user_id: 25},
      action: textAction('general')
    };
    manager.messagesStorageByPeerId[-50] = storage;
    manager.historiesStorage[-50] = mainHistory;
    manager.threadsStorage[-50] = {[GENERAL_TOPIC_ID]: threadHistory};

    manager.handleStreamedMessageTypingUpdate(update);
    const draftPayload = dispatchEvent.mock.calls.find(([event]) => event === 'streamed_message_update')[1];
    expect(draftPayload.draft.threadId).toBe(GENERAL_TOPIC_ID);
    expect(threadHistory.mids).toEqual([draftPayload.draft.tempId]);

    const finalMessage = {
      _: 'message',
      id: 102,
      mid: 1_000_102,
      peer_id: {_: 'peerChannel', channel_id: 50},
      peerId: -50 as PeerId,
      from_id: {_: 'peerUser', user_id: 25},
      fromId: 25 as PeerId,
      pFlags: {},
      date: 1_000,
      message: 'general complete',
      entities: []
    } as Message.message;
    storage.set(finalMessage.mid, finalMessage);
    dispatchEvent.mockClear();

    (manager as any).adoptStreamedMessageDraft(finalMessage);

    expect(dispatchEvent).toHaveBeenCalledWith(
      'streamed_message_finalize',
      expect.objectContaining({tempId: draftPayload.draft.tempId, finalMessage})
    );
    expect(threadHistory.mids).toEqual([]);
  });
});

function makeUpdatesLog() {
  const makeLogger = () => Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()});
  return Object.assign(makeLogger(), {bindPrefix: makeLogger});
}

function makeDifferenceUpdateManager(result: any) {
  const manager = new ApiUpdatesManager() as any;
  const invokeApi = vi.fn();
  (Array.isArray(result) ? result : [result]).forEach((value) => {
    if(value instanceof Error) invokeApi.mockRejectedValueOnce(value);
    else invokeApi.mockResolvedValueOnce(value);
  });
  let draftAlive = true;
  let adopted = false;
  let cancelled = false;
  const order: string[] = [];

  Object.assign(manager, {
    log: makeUpdatesLog(),
    apiManager: {invokeApi},
    appUsersManager: {saveApiUsers: vi.fn()},
    appChatsManager: {
      saveApiChats: vi.fn(),
      getChannelInput: () => ({_: 'inputChannel', channel_id: 50, access_hash: '1'})
    },
    appMessagesManager: {
      handleStreamedMessageTypingUpdate: vi.fn(() => {
        order.push('reconcile-draft');
        if(draftAlive) {
          draftAlive = false;
          cancelled = true;
        }
      })
    },
    rootScope: {dispatchEvent: vi.fn()},
    timeManager: {getServerTimeOffset: () => 0},
    dispatchEvent: vi.fn((event: string) => {
      if(event === 'updateNewMessage' || event === 'updateNewChannelMessage') {
        order.push('adopt-final');
        adopted = draftAlive;
        draftAlive = false;
      }
    })
  });
  Object.assign(manager.updatesState, {pts: 1, seq: 1, date: 1});

  return {
    manager,
    order,
    getResult: () => ({adopted, cancelled})
  };
}

describe('streamed draft difference ordering', () => {
  const draftUpdate = userTyping(textAction('complete'));
  const finalMessage = {
    _: 'message',
    id: 42,
    peer_id: {_: 'peerUser', user_id: peerId},
    pFlags: {},
    date: 1_000,
    message: 'complete result'
  } as Message.message;

  test('global difference lets new_messages adopt before reconciling exact draft actions', async() => {
    const {manager, order, getResult} = makeDifferenceUpdateManager([{
      _: 'updates.differenceSlice',
      new_messages: [],
      new_encrypted_messages: [],
      other_updates: [draftUpdate],
      chats: [],
      users: [],
      intermediate_state: {pts: 2, qts: 0, date: 2, seq: 2, unread_count: 0}
    }, {
      _: 'updates.difference',
      new_messages: [finalMessage],
      new_encrypted_messages: [],
      other_updates: [],
      chats: [],
      users: [],
      state: {pts: 3, qts: 0, date: 3, seq: 3, unread_count: 0}
    }]);

    await manager.getDifference();

    expect(order).toEqual(['adopt-final', 'reconcile-draft']);
    expect(getResult()).toEqual({adopted: true, cancelled: false});
  });

  test('channel difference lets new_messages adopt before reconciling exact draft actions', async() => {
    const channelDraft: Update.updateChannelUserTyping = {
      _: 'updateChannelUserTyping',
      channel_id: 50,
      from_id: {_: 'peerUser', user_id: authorId as UserId},
      action: textAction('complete')
    };
    const channelMessage = {
      ...finalMessage,
      peer_id: {_: 'peerChannel', channel_id: 50}
    } as Message.message;
    const {manager, order, getResult} = makeDifferenceUpdateManager([{
      _: 'updates.channelDifference',
      pFlags: {},
      pts: 2,
      timeout: 0,
      new_messages: [],
      other_updates: [channelDraft],
      chats: [],
      users: []
    }, {
      _: 'updates.channelDifference',
      pFlags: {final: true},
      pts: 3,
      timeout: 0,
      new_messages: [channelMessage],
      other_updates: [],
      chats: [],
      users: []
    }]);
    manager.addChannelState(50, 1);

    await manager.getChannelDifference(50);

    expect(order).toEqual(['adopt-final', 'reconcile-draft']);
    expect(getResult()).toEqual({adopted: true, cancelled: false});
  });

  test('global difference reconciles collected drafts once when a later slice fails', async() => {
    const error = new Error('next global slice failed');
    const {manager, order, getResult} = makeDifferenceUpdateManager([{
      _: 'updates.differenceSlice',
      new_messages: [],
      new_encrypted_messages: [],
      other_updates: [draftUpdate],
      chats: [],
      users: [],
      intermediate_state: {pts: 2, qts: 0, date: 2, seq: 2, unread_count: 0}
    }, error]);

    await expect(manager.getDifference()).rejects.toBe(error);

    expect(order).toEqual(['reconcile-draft']);
    expect(getResult()).toEqual({adopted: false, cancelled: true});
  });

  test('channel difference reconciles collected drafts once when a later slice fails', async() => {
    const channelDraft: Update.updateChannelUserTyping = {
      _: 'updateChannelUserTyping',
      channel_id: 50,
      from_id: {_: 'peerUser', user_id: authorId as UserId},
      action: textAction('complete')
    };
    const error = new Error('next channel slice failed');
    const {manager, order, getResult} = makeDifferenceUpdateManager([{
      _: 'updates.channelDifference',
      pFlags: {},
      pts: 2,
      timeout: 0,
      new_messages: [],
      other_updates: [channelDraft],
      chats: [],
      users: []
    }, error]);
    manager.addChannelState(50, 1);

    await expect(manager.getChannelDifference(50)).rejects.toBe(error);

    expect(order).toEqual(['reconcile-draft']);
    expect(getResult()).toEqual({adopted: false, cancelled: true});
  });
});

describe('AppProfileManager streamed typing routing', () => {
  test('does not leave empty ordinary-typing buckets for drafts or unknown cancels', () => {
    const manager = new AppProfileManager() as any;
    const handleStreamedMessageTypingUpdate = vi.fn();
    Object.assign(manager, {
      typingsInPeer: {},
      appPeersManager: {
        peerId: 999 as PeerId,
        getPeerId: () => peerId
      },
      appMessagesIdsManager: {generateMessageId: (value: number) => value},
      appMessagesManager: {handleStreamedMessageTypingUpdate}
    });

    manager.onUpdateUserTyping(userTyping(textAction('draft')));
    manager.onUpdateUserTyping(userTyping({_: 'sendMessageCancelAction'}));

    expect(handleStreamedMessageTypingUpdate).toHaveBeenCalledOnce();
    expect(manager.typingsInPeer).toEqual({});
  });
});
