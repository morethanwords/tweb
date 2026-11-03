import {Message, MessageReactions, Update} from '@layer';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import SlicedArray, {SliceEnd} from '@helpers/slicedArray';
import '@helpers/peerIdPolyfill';

const selfId = 1 as PeerId;
const peerId = 2 as PeerId;
const mid = 10;

function makeReactions(unread: boolean): MessageReactions {
  return {
    _: 'messageReactions',
    pFlags: {can_see_list: true},
    results: [{_: 'reactionCount', count: 1, reaction: {_: 'reactionEmoji', emoticon: '👍'}}],
    recent_reactions: [{
      _: 'messagePeerReaction',
      pFlags: unread ? {unread: true} : {},
      peer_id: {_: 'peerUser', user_id: peerId.toUserId()},
      date: 1,
      reaction: {_: 'reactionEmoji', emoticon: '👍'}
    }]
  };
}

function makeHarness(unreadReactionsCount: number) {
  const manager = new AppMessagesManager() as any;
  const message = {
    _: 'message',
    pFlags: {out: true},
    id: mid,
    mid,
    peerId,
    peer_id: {_: 'peerUser', user_id: peerId.toUserId()},
    date: 1,
    message: 'hello',
    reactions: makeReactions(true)
  } as any as Message.message;
  const dialog = {
    _: 'dialog',
    pFlags: {},
    peer: {_: 'peerUser', user_id: peerId.toUserId()},
    peerId,
    top_message: mid,
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: unreadReactionsCount
  } as any;
  const events: Array<[string, any]> = [];
  const invokeApi = vi.fn((method: string, _params?: any): Promise<any> => {
    if(method === 'messages.readReactions' || method === 'messages.readMentions') {
      return Promise.resolve({_: 'messages.affectedHistory', pts: 2, pts_count: 1, offset: 0});
    }

    if(method === 'messages.readMessageContents') {
      return Promise.resolve({_: 'messages.affectedMessages', pts: 2, pts_count: 1});
    }

    return Promise.reject(new Error('unexpected ' + method));
  });

  Object.assign(manager, {
    unreadMentions: {},
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    appPeersManager: {
      peerId: selfId,
      getPeerId: (peer: any) => peer?.user_id?.toPeerId?.(false) ?? peerId,
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: peerId.toUserId(), access_hash: '0'}),
      isForum: () => false,
      isBotforum: () => false,
      isChannel: () => false
    },
    getMonoforumThreadId: (): undefined => undefined,
    getMessageByPeer: () => message,
    pushBatchUpdate: vi.fn(),
    modifyMessage: (message: any, callback: (message: any) => void) => {
      callback(message);
      return message;
    },
    getNotifyPeerSettings: () => Promise.resolve({muted: false, peerTypeNotifySettings: {show_previews: false}}),
    dialogsStorage: {
      getAnyDialog: () => dialog,
      prepareDialogUnreadCountModifying: () => () => {},
      setDialogToState: vi.fn()
    },
    rootScope: {dispatchEvent: (name: string, payload: any) => events.push([name, payload])},
    apiManager: {invokeApi},
    apiUpdatesManager: {processLocalUpdate: vi.fn()}
  });

  const update = (reactions: MessageReactions): Update.updateMessageReactions => ({
    _: 'updateMessageReactions',
    peer: {_: 'peerUser', user_id: peerId.toUserId()},
    msg_id: mid,
    reactions
  });

  return {manager, message, dialog, events, invokeApi, update};
}

describe('unread reactions counter', () => {
  test('a reaction taken off before it was seen takes the badge with it', () => {
    const {manager, dialog, update} = makeHarness(1);
    // * the last reaction gone: the server sends the message's reactions without any recent ones
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {can_see_list: true}, results: []}));
    expect(dialog.unread_reactions_count).toBe(0);
  });

  test('a reaction taken off while another one stays unread leaves one on the badge', () => {
    const {manager, dialog, message, update} = makeHarness(2);
    const reactions = makeReactions(true);
    message.reactions.recent_reactions.push({...reactions.recent_reactions[0], date: 2});
    manager.onUpdateMessageReactions(update(reactions));
    expect(dialog.unread_reactions_count).toBe(2);
  });

  test('a min update, which leaves the recent reactions out, keeps the unread one on the badge', () => {
    const {manager, dialog, update} = makeHarness(1);
    const {results} = makeReactions(true);
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {min: true}, results}));
    expect(dialog.unread_reactions_count).toBe(1);
  });

  test('a min update with no reactions left takes the badge off', () => {
    const {manager, dialog, update} = makeHarness(1);
    manager.onUpdateMessageReactions(update({_: 'messageReactions', pFlags: {min: true}, results: []}));
    expect(dialog.unread_reactions_count).toBe(0);
  });

  test('a reaction read the usual way, or in another session, comes off the badge and notifies of nothing', () => {
    const {manager, dialog, update} = makeHarness(1);
    const getNotifyPeerSettings = manager.getNotifyPeerSettings = vi.fn(manager.getNotifyPeerSettings);
    manager.onUpdateMessageReactions(update(makeReactions(false)));
    expect(dialog.unread_reactions_count).toBe(0);
    expect(getNotifyPeerSettings).not.toHaveBeenCalled();
  });

  test('a new reaction notifies of it', () => {
    const {manager, message, update} = makeHarness(0);
    message.reactions = undefined;
    const getNotifyPeerSettings = manager.getNotifyPeerSettings = vi.fn(manager.getNotifyPeerSettings);
    manager.onUpdateMessageReactions(update(makeReactions(true)));
    expect(getNotifyPeerSettings).toHaveBeenCalledTimes(1);
  });

  test('a new reaction put before read ones, the newest first, notifies of it', () => {
    const {manager, message, update} = makeHarness(0);
    const read = makeReactions(false).recent_reactions[0];
    message.reactions = {...makeReactions(false), recent_reactions: [read, read, read]};
    const getNotifyPeerSettings = manager.getNotifyPeerSettings = vi.fn(manager.getNotifyPeerSettings);
    const unread = makeReactions(true).recent_reactions[0];
    manager.onUpdateMessageReactions(update({...makeReactions(true), recent_reactions: [unread, read, read]}));
    expect(getNotifyPeerSettings).toHaveBeenCalledTimes(1);
  });

  test('reading all reactions clears the badge and the cached list at once', async() => {
    const {manager, dialog, events} = makeHarness(3);
    const cached = new SlicedArray<number>();
    cached.insertSlice([30, 20, 10]);
    cached.first.setEnd(SliceEnd.Both);
    manager.unreadMentions[`${peerId}_reaction`] = cached;

    await manager.readMentions(peerId, undefined, true);

    expect(dialog.unread_reactions_count).toBe(0);
    expect(cached.length).toBe(0);
    expect(events.some(([name, payload]) => name === 'dialog_unread' && payload.dialog === dialog)).toBe(true);
  });
});

// * `messages.readReactions` reads every reaction of the chat on every device: a message seen reads its
// * own (`readMessageContents`), and the whole chat's only when it was all that was left, as Android does
// * (ChatActivity: markReactionsAsRead once its count of unseen ones is 0)
describe('reading the messages seen', () => {
  const methods = (invokeApi: ReturnType<typeof makeHarness>['invokeApi']) => invokeApi.mock.calls.map(([method]) => method);

  test('a reaction seen out of many reads that message alone', async() => {
    const {manager, invokeApi} = makeHarness(4700);
    await manager.readMessages(peerId, [mid]);
    expect(methods(invokeApi)).toEqual(['messages.readMessageContents']);
  });

  test('the last unread reaction seen reads the chat\'s reactions too', async() => {
    const {manager, invokeApi} = makeHarness(1);
    await manager.readMessages(peerId, [mid]);
    expect(methods(invokeApi)).toEqual(['messages.readMessageContents', 'messages.readReactions']);
  });

  /** A mention to us that is not read, the chat counting `unreadMentionsCount`, the server `serverUnreadIds` */
  function makeMentionHarness(unreadMentionsCount: number, serverUnreadIds: number[]) {
    const harness = makeHarness(0);
    const {manager, message, dialog, invokeApi} = harness;
    message.pFlags = {mentioned: true, media_unread: true};
    message.reactions = undefined;
    dialog.unread_mentions_count = unreadMentionsCount;

    const readContents = invokeApi.getMockImplementation();
    invokeApi.mockImplementation((method: string, params?: any) => {
      if(method === 'messages.getUnreadMentions') {
        return Promise.resolve({_: 'messages.messages', messages: serverUnreadIds.map((id) => ({...message, id, mid: id})), chats: [], users: []});
      }

      return readContents(method, params);
    });

    Object.assign(manager, {
      getChannelAvailableMinIdGeneration: () => 0,
      saveApiResult: vi.fn(),
      reloadConversationOrTopic: vi.fn()
    });
    manager.apiManager.invokeApiSingleProcess = ({method, params, processResult}: any) => invokeApi(method, params).then(processResult);

    return harness;
  }

  test('a mention seen out of several reads that message alone', async() => {
    const {manager, invokeApi} = makeMentionHarness(3, [mid, 20, 30]);
    await manager.readMessages(peerId, [mid]);
    expect(methods(invokeApi)).toEqual(['messages.readMessageContents']);
  });

  test('the last unread mention seen reads the chat\'s mentions once the server has no other', async() => {
    const {manager, invokeApi} = makeMentionHarness(1, []);
    await manager.readMessages(peerId, [mid]);
    expect(methods(invokeApi)).toEqual(['messages.readMessageContents', 'messages.getUnreadMentions', 'messages.readMentions']);
  });

  test('the last mention by the count here, while the server has another unread, reads nothing more and takes the server\'s count', async() => {
    const {manager, invokeApi} = makeMentionHarness(1, [20]);
    await manager.readMessages(peerId, [mid]);
    expect(methods(invokeApi)).toEqual(['messages.readMessageContents', 'messages.getUnreadMentions']);
    expect(manager.reloadConversationOrTopic).toHaveBeenCalledWith(peerId, undefined);
  });

  test('a forum topic\'s mentions seen one at a time come off the topic, and the last one reads the topic\'s', async() => {
    const channelId = 5 as ChatId;
    const forumPeerId = channelId.toPeerId(true);
    const topicId = 100;
    const messages = new Map([11, 12].map((id) => [id, {
      _: 'message',
      pFlags: {mentioned: true, media_unread: true},
      id,
      mid: id,
      peerId: forumPeerId,
      peer_id: {_: 'peerChannel', channel_id: channelId},
      reply_to: {_: 'messageReplyHeader', pFlags: {forum_topic: true}, reply_to_msg_id: topicId},
      date: 1,
      message: 'hi'
    } as any as Message.message]));
    const parent = {_: 'dialog', pFlags: {}, peerId: forumPeerId, unread_mentions_count: 2} as any;
    const topic = {_: 'forumTopic', pFlags: {}, id: topicId, peerId: forumPeerId, unread_mentions_count: 2} as any;
    const invokeApi = vi.fn((method: string, _params?: any): Promise<any> => {
      switch(method) {
        case 'channels.readMessageContents': return Promise.resolve(true);
        case 'messages.getUnreadMentions': return Promise.resolve({_: 'messages.messages', messages: [], chats: [], users: []});
        case 'messages.readMentions': return Promise.resolve({_: 'messages.affectedHistory', pts: 2, pts_count: 1, offset: 0});
      }

      return Promise.reject(new Error('unexpected ' + method));
    });
    const manager = new AppMessagesManager() as any;
    Object.assign(manager, {
      unreadMentions: {},
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      appPeersManager: {
        getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: channelId, access_hash: '0'}),
        isForum: () => true,
        isBotforum: () => false,
        isChannel: () => true
      },
      appChatsManager: {getChannelInput: () => ({_: 'inputChannel', channel_id: channelId, access_hash: '0'})},
      getMessageByPeer: (_peerId: PeerId, mid: number) => messages.get(mid),
      getDialogOnly: () => parent,
      modifyMessage: (message: any, callback: (message: any) => void) => {
        callback(message);
        return message;
      },
      dialogsStorage: {
        getAnyDialog: (_peerId: PeerId, threadId?: number) => threadId ? topic : parent,
        prepareDialogUnreadCountModifying: () => () => {},
        setDialogToState: vi.fn()
      },
      rootScope: {dispatchEvent: vi.fn()},
      apiManager: {
        invokeApi,
        invokeApiSingleProcess: ({method, params, processResult}: any) => invokeApi(method, params).then(processResult)
      },
      apiUpdatesManager: {
        processLocalUpdate: (update: Update) => {
          if(update._ === 'updateChannelReadMessagesContents') manager.onUpdateReadMessagesContents(update);
        }
      },
      getChannelAvailableMinIdGeneration: () => 0,
      saveApiResult: vi.fn(),
      reloadConversationOrTopic: vi.fn()
    });

    // * the jump-to-mention lists of the topic and of the forum viewed as messages
    const cached = [`${forumPeerId}_${topicId}`, `${forumPeerId}`].map((key) => {
      const slicedArray = manager.unreadMentions[key] = new SlicedArray<number>();
      slicedArray.insertSlice([12, 11]);
      slicedArray.first.setEnd(SliceEnd.Both);
      return slicedArray;
    });

    await manager.readMessages(forumPeerId, [11]);
    expect(methods(invokeApi)).toEqual(['channels.readMessageContents']);
    expect([topic.unread_mentions_count, parent.unread_mentions_count]).toEqual([1, 1]);
    expect(cached.map((slicedArray) => [...slicedArray.slice])).toEqual([[12], [12]]);

    await manager.readMessages(forumPeerId, [12]);
    expect(methods(invokeApi)).toEqual(['channels.readMessageContents', 'channels.readMessageContents', 'messages.getUnreadMentions', 'messages.readMentions']);
    expect(invokeApi).toHaveBeenLastCalledWith('messages.readMentions', expect.objectContaining({top_msg_id: topicId}));
    expect([topic.unread_mentions_count, parent.unread_mentions_count]).toEqual([0, 0]);
  });
});

