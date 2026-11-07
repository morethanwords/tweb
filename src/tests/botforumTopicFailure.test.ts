import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';
import pause from '@helpers/schedulers/pause';
import deferredPromise from '@helpers/cancellablePromise';
import {logger, LogTypes} from '@lib/logger';
import {makeMessagesManager, peerId as sendPeerId} from '@/tests/helpers/messageSending';

// The first message to a bot's forum makes a topic for it, and what is sent meanwhile waits for the topic.
// If the topic cannot be made, it goes, and what waited fails with it rather than waiting for good; the next
// send makes a topic anew.

const peerId = (99 as UserId).toPeerId(false);

function setup(createForumTopic: () => Promise<any>) {
  const manager = new AppMessagesManager();
  const dumpTemporaryTopic = vi.fn();
  Object.assign(manager as any, {
    log: logger('MESSAGES', LogTypes.None),
    apiManager: {invokeApi: vi.fn(createForumTopic)},
    apiUpdatesManager: {processUpdateMessage: vi.fn()},
    appPeersManager: {
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 99, access_hash: '0'}),
      getPeerId: (peer: any) => (peer.user_id as UserId).toPeerId(false)
    },
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    dialogsStorage: {
      setTemporaryForumTopic: () => dumpTemporaryTopic,
      getForumTopicById: vi.fn().mockResolvedValue(undefined)
    },
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue((manager as any).createMessageStorage(peerId, 'history'));
  const cancelPendingMessage = vi.spyOn(manager, 'cancelPendingMessage').mockReturnValue(true);
  const onMessagesSendError = vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(() => {});

  const topicMessage = {
    _: 'messageService',
    id: 1.0001,
    mid: 1.0001,
    peerId,
    date: 0,
    pFlags: {},
    action: {_: 'messageActionTopicCreate', title: 'New Chat', icon_color: 1}
  } as any;
  const queued = {_: 'message', mid: 1.0002, peerId, pFlags: {is_outgoing: true}, send: vi.fn()} as any as Message.message;

  const create = () => {
    const promise = (manager as any).createPendingBotforumTopic({
      peerId,
      title: 'New Chat',
      tempId: topicMessage.id,
      randomId: '11',
      message: topicMessage,
      iconColor: 1
    });
    // * a message sent to the topic while it is being made
    (manager as any).pendingNewBotforumTopics[peerId].queuedMessages.push(queued);
    return promise;
  };

  return {manager, create, queued, dumpTemporaryTopic, cancelPendingMessage, onMessagesSendError};
}

describe('a topic of a bot\'s forum', () => {
  test('that cannot be made fails what waited for it, and goes', async() => {
    const error = {type: 'USER_IS_BLOCKED'};
    const {manager, create, queued, dumpTemporaryTopic, cancelPendingMessage, onMessagesSendError} = setup(() => Promise.reject(error));

    await create();
    await pause(0);

    expect(queued.send).not.toHaveBeenCalled();
    expect(onMessagesSendError).toHaveBeenCalledWith([queued], error);
    expect(cancelPendingMessage).toHaveBeenCalledWith('11');
    expect(dumpTemporaryTopic).toHaveBeenCalled();
    expect((manager as any).pendingNewBotforumTopics[peerId]).toBeUndefined();
    // * a chat opened on the temporary topic leaves it
    expect((manager as any).rootScope.dispatchEvent).toHaveBeenCalledWith('botforum_pending_topic_failed', {peerId, tempId: 1.0001});
  });

  test('that is made sends what waited for it', async() => {
    const {create, queued, onMessagesSendError} = setup(() => Promise.resolve({
      _: 'updates',
      updates: [{_: 'updateMessageID', id: 5, random_id: '11'}],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    }));

    await create();

    expect(queued.send).toHaveBeenCalledOnce();
    expect(onMessagesSendError).not.toHaveBeenCalled();
  });

  test('that cannot be made after a reset leaves the topic made since alone', async() => {
    const {manager, create} = setup(() => Promise.reject({type: 'USER_IS_BLOCKED'}));

    const failing = create();
    // * the manager is reset meanwhile (a difference too long), and a send makes another topic
    const replacement = {tempId: 2.0001, beforeMessageSendCallbacks: [] as any[], queuedMessages: [] as any[]};
    (manager as any).pendingNewBotforumTopics = {[peerId]: replacement};
    await failing;

    expect((manager as any).pendingNewBotforumTopics[peerId]).toBe(replacement);
  });

  test('that cannot be made fails a send still preparing for it, rather than sending it to the message before', async() => {
    const error = {type: 'USER_IS_BLOCKED'};
    const {manager, create, onMessagesSendError} = setup(() => Promise.reject(error));
    (manager as any).getMonoforumThreadId = (): undefined => undefined;
    await create();

    // * it took the temporary topic as its reply and was still waiting for the config when the topic failed
    const preparing = {_: 'message', id: 1.0003, mid: 1.0003, peerId, peer_id: {_: 'peerUser', user_id: 99}, pFlags: {is_outgoing: true}, random_id: '12', send: vi.fn(), promise: deferredPromise<void>()} as any as Message.message;
    manager.beforeMessageSending(preparing, {replyToMsgId: 1.0001, noOutgoingMessage: true, processAfter: (callback) => callback()});

    expect(preparing.send).not.toHaveBeenCalled();
    expect(onMessagesSendError).toHaveBeenCalledWith([preparing], error, undefined);
    // * the send's caller (sendText, startBot) hears of it too, instead of waiting for good
    await expect(preparing.promise).rejects.toBe(error);

    // * another bot's chat counts its temporary ids from the same start: its topic of that id is its own
    const otherPeerId = (100 as UserId).toPeerId(false);
    const other = {_: 'message', id: 1.0003, mid: 1.0003, peerId: otherPeerId, peer_id: {_: 'peerUser', user_id: 100}, pFlags: {is_outgoing: true}, random_id: '13', send: vi.fn()} as any as Message.message;
    manager.beforeMessageSending(other, {replyToMsgId: 1.0001, noOutgoingMessage: true, processAfter: (callback) => callback()});
    expect(other.send).toHaveBeenCalledOnce();
  });

  test('a text sent hands the temporary topic it took as its reply on to the check above', async() => {
    const {manager} = makeMessagesManager();
    const checkSendOptions = vi.mocked(manager.checkSendOptions).getMockImplementation();
    // * what checkSendOptions does for the first send to a bot's forum: the topic being made is the reply
    vi.mocked(manager.checkSendOptions).mockImplementation(async(options) => {
      options.replyToMsgId = 1.0001;
      return checkSendOptions(options);
    });

    await manager.sendText({peerId: sendPeerId, text: 'hi', forceOrdinary: true});

    expect(manager.beforeMessageSending).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({replyToMsgId: 1.0001}));
  });
});

describe('a pending message called off in a private chat', () => {
  test('is deleted in the chat it names, not in one found by its temporary id, which another chat may share', () => {
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      appWidgetsManager: {deleteWidgetStorageByLegacyMids: () => {}}
    });
    const findPeerIdByMids = vi.spyOn(manager as any, 'findPeerIdByMids');
    // * found there, it is taken out the short way (as an ephemeral one): the lookup is what is checked
    const getMessageByPeer = vi.spyOn(manager, 'getMessageByPeer').mockReturnValue({ephemeral_id: 1} as any);
    vi.spyOn(manager as any, 'isDeliveredEphemeralMessage').mockReturnValue(true);
    vi.spyOn(manager as any, 'removeEphemeralMessages').mockImplementation(() => {});

    (manager as any).onUpdateDeleteMessages({_: 'updateDeleteMessages', messages: [1.0001], pts: undefined, pts_count: undefined, peerId});

    expect(findPeerIdByMids).not.toHaveBeenCalled();
    expect(getMessageByPeer).toHaveBeenCalledWith(peerId, 1.0001);
  });
});
