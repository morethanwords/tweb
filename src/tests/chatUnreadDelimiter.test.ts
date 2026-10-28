import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import {ChatType} from '@components/chat/chatType';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';
import {makeFullMid} from '@appManagers/utils/messages/fullMid';

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const peerId = -10 as PeerId;
const readMaxId = MESSAGE_ID_OFFSET + 4;
const maxId = MESSAGE_ID_OFFSET + 8;
const unreadMid = MESSAGE_ID_OFFSET + 5;

function makeHarness() {
  let current = true;
  const bubble = document.createElement('div');
  const historyStorage = {type: 'history', readMaxId, maxId};
  const getReadMaxIdIfUnread = vi.fn(async() => readMaxId);
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      peerId,
      type: ChatType.Chat,
      historyStorage,
      getHistoryMaxId: () => historyStorage.maxId,
      getMessageByPeer: vi.fn(() => ({pFlags: {out: false}}))
    },
    managers: {appMessagesManager: {getReadMaxIdIfUnread}},
    getMiddleware: () => () => current,
    findFirstUnreadFullMid: vi.fn(() => makeFullMid(peerId, unreadMid)),
    getBubble: vi.fn(() => bubble)
  });
  return {harness, bubble, historyStorage, getReadMaxIdIfUnread, cancel: () => {current = false;}};
}

test.each([
  {cursor: readMaxId, out: false, expected: true},
  {cursor: readMaxId, out: true, expected: false},
  {cursor: maxId, out: false, expected: false},
  {cursor: maxId + 1, out: false, expected: false},
  {cursor: MESSAGE_ID_OFFSET, out: false, expected: false},
  {cursor: 0, out: false, expected: false},
  {cursor: readMaxId, out: undefined, expected: true}
])('uses the mirrored root cursor with the manager semantics: %s', async({cursor, out, expected}) => {
  const {harness, bubble, historyStorage, getReadMaxIdIfUnread} = makeHarness();
  historyStorage.readMaxId = cursor;
  harness.chat.getMessageByPeer.mockReturnValue(out === undefined ? undefined : {pFlags: {out}});
  await harness.setUnreadDelimiter();
  expect(getReadMaxIdIfUnread).not.toHaveBeenCalled();
  expect(bubble.classList.contains('is-first-unread')).toBe(expected);
  if(expected) expect(harness.findFirstUnreadFullMid).toHaveBeenCalledExactlyOnceWith(cursor);
});

test('uses the root history mirror for a forum without borrowing a topic cursor', async() => {
  const {harness, getReadMaxIdIfUnread} = makeHarness();
  harness.chat.isForum = true;
  await harness.setUnreadDelimiter();
  expect(getReadMaxIdIfUnread).not.toHaveBeenCalled();
  expect(harness.findFirstUnreadFullMid).toHaveBeenCalledExactlyOnceWith(readMaxId);
});

test.each([
  {type: ChatType.Discussion},
  {threadId: 40, isForum: true},
  {threadId: 40, isBotforum: true},
  {isMonoforum: true},
  {isMonoforum: true, canManageDirectMessages: true, monoforumThreadId: 50}
])('keeps the manager cursor for scopes outside an ordinary root: %s', async(scope) => {
  const {harness, getReadMaxIdIfUnread} = makeHarness();
  Object.assign(harness.chat, scope);
  await harness.setUnreadDelimiter();
  expect(getReadMaxIdIfUnread).toHaveBeenCalledExactlyOnceWith(peerId, harness.chat.threadId || harness.chat.monoforumThreadId);
});

test.each([
  {readMaxId: undefined},
  {maxId: undefined},
  {readMaxId: NaN},
  {maxId: NaN},
  {type: 'search'},
  {searchHistory: {}}
])('falls back when the mirrored root history is incomplete or filtered: %s', async(state) => {
  const {harness, historyStorage, getReadMaxIdIfUnread} = makeHarness();
  Object.assign(historyStorage, state);
  await harness.setUnreadDelimiter();
  expect(getReadMaxIdIfUnread).toHaveBeenCalledExactlyOnceWith(peerId, undefined);
});

test('reads a cursor advanced during preparation instead of reusing an earlier unread snapshot', async() => {
  const {harness, historyStorage, getReadMaxIdIfUnread} = makeHarness();
  historyStorage.readMaxId = maxId;
  await harness.setUnreadDelimiter();
  expect(harness.findFirstUnreadFullMid).not.toHaveBeenCalled();
  expect(getReadMaxIdIfUnread).not.toHaveBeenCalled();
});

test('asks the manager when the page has not received a history mirror', async() => {
  const {harness, getReadMaxIdIfUnread} = makeHarness();
  harness.chat.historyStorage = undefined;
  await harness.setUnreadDelimiter();
  expect(getReadMaxIdIfUnread).toHaveBeenCalledExactlyOnceWith(peerId, undefined);
});

test('keeps an aggregated monoforum view free of a per-thread unread divider', async() => {
  const {harness, getReadMaxIdIfUnread} = makeHarness();
  Object.assign(harness.chat, {isMonoforum: true, canManageDirectMessages: true});
  await harness.setUnreadDelimiter();
  expect(harness.findFirstUnreadFullMid).not.toHaveBeenCalled();
  expect(getReadMaxIdIfUnread).not.toHaveBeenCalled();
});

test('does not attach a divider when a fallback reply arrives after the chat changed', async() => {
  const {harness, bubble, historyStorage, getReadMaxIdIfUnread, cancel} = makeHarness();
  historyStorage.readMaxId = undefined;
  const reply = deferredPromise<number>();
  getReadMaxIdIfUnread.mockReturnValue(reply);
  const pending = harness.setUnreadDelimiter();
  cancel();
  reply.resolve(readMaxId);
  await pending;
  expect(harness.findFirstUnreadFullMid).not.toHaveBeenCalled();
  expect(bubble.classList.contains('is-first-unread')).toBe(false);
});

test('does not decorate the top message when it is the only unread bubble', async() => {
  const {harness, bubble} = makeHarness();
  harness.findFirstUnreadFullMid.mockReturnValue(makeFullMid(peerId, maxId));
  await harness.setUnreadDelimiter();
  expect(harness.firstUnreadBubble).toBe(bubble);
  expect(harness.attachedUnreadBubble).toBe(true);
  expect(bubble.classList.contains('is-first-unread')).toBe(false);
});
