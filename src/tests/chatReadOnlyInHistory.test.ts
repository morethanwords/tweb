import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {ChatType} from '@components/chat/chatType';
import '@helpers/peerIdPolyfill';

/**
 * What a chat's messages seen read is the chat's history itself (a chat, a thread of comments): the list of its pinned
 * messages, of its recent actions, of search results shows some of them, not the ones around them. tdesktop's
 * PinnedWidget reads nothing (`listMarkReadTill` / `listMarkContentsRead` are empty), its admin log neither. Such a list
 * here read the chat up to the message seen, and the pinned one - whose history storage is the chat's - up to the
 * chat's newest message once its newest pin was seen: every message of the chat read unseen.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

// * an unread message of a list of this type rendered: watched to be read, its history and its mention or reaction
function renderUnread(type: ChatType) {
  const observe = vi.fn();
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {type, peerId: -100, isPreview: false},
    observer: {observe},
    unreaded: new Map(),
    unreadedContent: new Map()
  });

  const bubble = document.createElement('div');
  harness.setUnreadObserver('history', bubble, 50);
  harness.setUnreadObserver('content', bubble, 50);
  return {harness, observe, bubble};
}

test.each([ChatType.Pinned, ChatType.Logs, ChatType.Search])('a list of %s messages is not watched to read them', (type) => {
  const {harness, observe} = renderUnread(type);
  expect(observe).not.toHaveBeenCalled();
  expect(harness.unreaded.size).toBe(0);
  expect(harness.unreadedContent.size).toBe(0);
});

test.each([ChatType.Chat, ChatType.Discussion])('the history (%s) is watched to read it', (type) => {
  const {harness, observe, bubble} = renderUnread(type);
  expect(observe).toHaveBeenCalledTimes(2);
  expect(harness.unreaded.get(bubble)).toBe(50);
  expect(harness.unreadedContent.get(bubble)).toBe(50);
});
