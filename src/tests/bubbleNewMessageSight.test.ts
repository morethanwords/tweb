import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';

/**
 * A message that comes while the list is at its end goes in in sight: the list goes to it, and a widget in it starts at
 * once. One that comes while the list is scrolled up from its end goes in out of sight: a widget in it keeps its place
 * and starts as it comes near the screen, holding nothing of the queue up and asking nothing before it is seen.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

function makeHarness(scrolledDown: boolean) {
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    scrollable: {loadedAll: {bottom: true, top: true}},
    chat: {type: 'chat', cancelPreservePaddingScroll: vi.fn()},
    scrolledDown,
    getBubble: (): undefined => undefined,
    renderGroupedItem: (): undefined => undefined,
    getMiddleware: () => () => true,
    setTopPadding: () => ({}),
    scrollToEnd: vi.fn(() => Promise.resolve()),
    performHistoryResult: vi.fn(() => Promise.resolve())
  });

  return harness;
}

const message = {_: 'message', peerId: 10, mid: 5, pFlags: {}, message: ''};

test('a message coming while the list is at its end goes in in sight', async() => {
  const harness = makeHarness(true);
  await harness._renderNewMessage(message);
  const [, , , sight] = harness.performHistoryResult.mock.calls[0];
  expect(sight).toBeUndefined();
  expect(harness.scrollToEnd).toHaveBeenCalled();
});

test('a message coming while the list is scrolled up from its end goes in out of sight', async() => {
  const harness = makeHarness(false);
  await harness._renderNewMessage(message);
  const [, , , sight] = harness.performHistoryResult.mock.calls[0];
  expect(sight.isOutOfSight(message.mid)).toBe(true);
  expect(harness.scrollToEnd).not.toHaveBeenCalled();
});
