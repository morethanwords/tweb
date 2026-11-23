import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import AppAttachMenuBotsManager from '@appManagers/appAttachMenuBotsManager';
import {AppPeersManager} from '@appManagers/appPeersManager';
import type {InputReplyTo} from '@layer';
import {makeReplyInputManager, replyInputPeer} from '@/tests/helpers/replyInput';

// * a mini app opened in a forum topic (or a comments thread) answers into that thread, as a message sent there goes:
// * with no message to reply to, reply_to points at the thread's root (tdesktop's ReplyToForMTP, data_histories.cpp)
const PEER_ID = (777 as ChatId).toPeerId(true);
const MY_ID = (42 as UserId).toPeerId(false);
const BOT_ID = 7 as BotId;
const TOPIC_ID = 50;

function makeManager() {
  const invokeApiSingleProcess = vi.fn((_options: {method: string, params: {reply_to?: InputReplyTo}}) => Promise.resolve());
  const manager = Object.create(AppAttachMenuBotsManager.prototype) as AppAttachMenuBotsManager;
  Object.assign(manager as any, {
    appMessagesManager: makeReplyInputManager(),
    appPeersManager: {
      peerId: MY_ID,
      getInputPeerById: () => replyInputPeer,
      isSavedDialog: AppPeersManager.prototype.isSavedDialog
    },
    appUsersManager: {getUserInput: () => ({_: 'inputUser', user_id: BOT_ID, access_hash: '1'})},
    apiManager: {invokeApiSingleProcess, getThemeParams: (): undefined => undefined}
  });

  const sentReplyTo = () => invokeApiSingleProcess.mock.calls[0][0].params.reply_to as InputReplyTo.inputReplyToMessage;
  return {manager, invokeApiSingleProcess, sentReplyTo};
}

describe('a mini app opened in a thread', () => {
  it('asks for its web view in the topic it was opened in', async() => {
    const {manager, invokeApiSingleProcess, sentReplyTo} = makeManager();
    await manager.requestWebView({botId: BOT_ID, peerId: PEER_ID, threadId: TOPIC_ID});

    expect(invokeApiSingleProcess.mock.calls[0][0].method).toBe('messages.requestWebView');
    expect(sentReplyTo()).toMatchObject({_: 'inputReplyToMessage', reply_to_msg_id: TOPIC_ID, top_msg_id: TOPIC_ID});
  });

  it('keeps the web view alive in that topic', async() => {
    const {manager, invokeApiSingleProcess, sentReplyTo} = makeManager();
    await manager.prolongWebView({botId: BOT_ID, peerId: PEER_ID, threadId: TOPIC_ID, queryId: '1'});

    expect(invokeApiSingleProcess.mock.calls[0][0].method).toBe('messages.prolongWebView');
    expect(sentReplyTo()).toMatchObject({_: 'inputReplyToMessage', reply_to_msg_id: TOPIC_ID, top_msg_id: TOPIC_ID});
  });

  it('replies to the message it was asked to, in the topic', async() => {
    const {manager, sentReplyTo} = makeManager();
    await manager.requestWebView({botId: BOT_ID, peerId: PEER_ID, threadId: TOPIC_ID, replyToMsgId: 60});

    expect(sentReplyTo()).toMatchObject({_: 'inputReplyToMessage', reply_to_msg_id: 60, top_msg_id: TOPIC_ID});
  });

  it('outside a thread, replies to nothing', async() => {
    const {manager, sentReplyTo} = makeManager();
    await manager.requestWebView({botId: BOT_ID, peerId: PEER_ID});

    expect(sentReplyTo()).toBeUndefined();
  });

  // * a saved dialog's thread is the peer the messages were saved from, not a message to reply to
  it('in a saved dialog, replies to nothing', async() => {
    const {manager, sentReplyTo} = makeManager();
    await manager.requestWebView({botId: BOT_ID, peerId: MY_ID, threadId: MY_ID});

    expect(sentReplyTo()).toBeUndefined();
  });
});
