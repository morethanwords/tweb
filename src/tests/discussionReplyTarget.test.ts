import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';

/**
 * A reply clicked in a post's discussion: one to the channel's post goes to the post's copy that starts the thread.
 * The start is the thread's first message, asked of its history; a history that came back empty used to throw on the
 * click (the first message of none read), and the reply went nowhere.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const DISCUSSION_PEER_ID = -20 as PeerId;
const THREAD_ID = 5;
const POST_MID = 77;

function getTarget(options: {history: number[], messages?: {[mid: number]: any}}, mid = POST_MID) {
  const getHistory = vi.fn(async() => ({count: options.history.length, history: options.history, isEnd: {}}));
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      threadId: THREAD_ID,
      getMessageByPeer: (peerId: PeerId, mid: number) => options.messages?.[mid]
    },
    managers: {appMessagesManager: {getHistory}}
  });

  const promise: Promise<{peerId: PeerId, mid: number}> = harness.getDiscussionReplyTarget(DISCUSSION_PEER_ID, mid);
  return {promise, getHistory};
}

test('asks the thread for its first message', async() => {
  const {promise, getHistory} = getTarget({history: []});
  await promise;
  expect(getHistory).toHaveBeenCalledWith({
    peerId: DISCUSSION_PEER_ID,
    threadId: THREAD_ID,
    limit: 1,
    offsetId: 1,
    addOffset: -1
  });
});

test('a reply to the post goes to its copy that starts the thread', async() => {
  const {promise} = getTarget({
    history: [THREAD_ID],
    messages: {[THREAD_ID]: {_: 'message', mid: THREAD_ID, peerId: DISCUSSION_PEER_ID, fwd_from: {channel_post: POST_MID}}}
  });
  await expect(promise).resolves.toEqual({peerId: DISCUSSION_PEER_ID, mid: THREAD_ID});
});

test('an empty history: the reply goes where it points', async() => {
  await expect(getTarget({history: []}).promise).resolves.toEqual({peerId: DISCUSSION_PEER_ID, mid: POST_MID});
});

test('a first message that is not at hand: the reply goes where it points', async() => {
  await expect(getTarget({history: [THREAD_ID]}).promise).resolves.toEqual({peerId: DISCUSSION_PEER_ID, mid: POST_MID});
});

test('a first message that is no copy of this post: the reply goes where it points', async() => {
  const messages = {
    [THREAD_ID]: {_: 'message', mid: THREAD_ID, peerId: DISCUSSION_PEER_ID, fwd_from: {channel_post: POST_MID + 1}}
  };
  await expect(getTarget({history: [THREAD_ID], messages}).promise).resolves.toEqual({peerId: DISCUSSION_PEER_ID, mid: POST_MID});
  await expect(getTarget({history: [THREAD_ID], messages: {[THREAD_ID]: {_: 'messageService', mid: THREAD_ID}}}).promise)
  .resolves.toEqual({peerId: DISCUSSION_PEER_ID, mid: POST_MID});
});
