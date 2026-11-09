import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT, makeMessageBubble} from '@/tests/helpers/chatBubbles';
import {makeFullMid} from '@appManagers/utils/messages/fullMid';
import '@helpers/peerIdPolyfill';

/**
 * In an open chat the go-down button goes to the first unread message while it is below the screen, and to the end
 * once it is not (tdesktop's `insideJumpToEndInsteadOfToUnread`). That message is the unread delimiter, frozen for as
 * long as the chat is open - so the second press goes to the end. The delimiter used to be kept only as its bubble:
 * once the viewport slice took that bubble away (a long unread stretch read down), or when no delimiter had been
 * drawn at all, the first unread was asked of the live read cursor, which sits at the bottom of the screen because
 * everything on it has just been read - and every press went down one screen instead of to the end.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = 10;
const VIEWPORT_BOTTOM = 800;
const BUBBLE_HEIGHT = 100;

/**
 * A list of incoming bubbles, oldest first, stacked from `firstOnScreen` at the top of the viewport
 */
function makeHarness({rendered, firstOnScreen, anchor}: {
  rendered: number[],
  firstOnScreen: number,
  // * the message the delimiter was frozen on, its bubble sliced away
  anchor?: number
}) {
  let scrolledTo = rendered.indexOf(firstOnScreen);
  const bubbles: {[fullMid: string]: HTMLElement} = {};
  const elements = new Map<HTMLElement, {timelineKey: {position: number}}>();
  rendered.forEach((mid, idx) => {
    const bubble = makeMessageBubble(PEER_ID, mid);
    bubble.getBoundingClientRect = () => ({top: (idx - scrolledTo) * BUBBLE_HEIGHT + BUBBLE_HEIGHT / 2} as DOMRect);
    bubbles[makeFullMid(PEER_ID, mid)] = bubble;
    elements.set(bubble, {timelineKey: {position: mid}});
  });

  const getBubbleByMid = (mid: number) => bubbles[makeFullMid(PEER_ID, mid)];
  const onScreen = () => rendered.filter((mid) => {
    const {top} = getBubbleByMid(mid).getBoundingClientRect();
    return top >= 0 && top < VIEWPORT_BOTTOM;
  });

  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      bubblesViewport: {getBoundingClientRect: () => ({bottom: VIEWPORT_BOTTOM} as DOMRect)}
    },
    bubbles,
    firstUnreadBubble: null as HTMLElement,
    attachedUnreadBubble: anchor !== undefined,
    firstUnreadFullMid: anchor !== undefined ? makeFullMid(PEER_ID, anchor) : undefined,
    getRenderedHistory: () => rendered.map((mid) => makeFullMid(PEER_ID, mid)),
    getViewportSlice: () => ({visible: onScreen().map((mid) => ({element: getBubbleByMid(mid)}))}),
    bubbleGroups: {getItemByBubble: (element: HTMLElement) => elements.get(element)},
    // * a press scrolls the bubble to the top; what lands on the screen is read at once
    scrollToBubble: vi.fn((bubble: HTMLElement) => {
      scrolledTo = rendered.indexOf(+bubble.dataset.mid);
      return Promise.resolve();
    })
  });

  // * the read cursor follows the bottom of the screen
  const readMaxId = () => onScreen().pop();
  return {harness, readMaxId, getBubbleByMid};
}

test('the delimiter sliced away above the screen: down is the end, not the next screen', () => {
  // * opened on the delimiter at 20, read down to 59 - its bubble is long gone, and 60.. waits right below the screen
  const {harness, readMaxId} = makeHarness({rendered: [52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62], firstOnScreen: 52, anchor: 20});
  expect(readMaxId()).toBe(59);
  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(true);
});

test('the delimiter sliced away below the screen (scrolled up past it): the press goes back down to it first', () => {
  const {harness, readMaxId} = makeHarness({rendered: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39], firstOnScreen: 30, anchor: 100});
  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(false);
});

test('the delimiter rendered again below the screen: it is the one gone to', () => {
  const {harness, readMaxId, getBubbleByMid} = makeHarness({rendered: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], firstOnScreen: 30, anchor: 40});
  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(false);
  expect(harness.getFirstUnreadBubble(readMaxId())).toBe(getBubbleByMid(40));
});

test('no delimiter drawn: the first press goes to the first unread, the second to the end', () => {
  // * the chat was opened with nothing unread (or at a saved position), the new messages came in below
  const rendered = Array.from({length: 40}, (_, idx) => 50 + idx);
  const {harness, readMaxId, getBubbleByMid} = makeHarness({rendered, firstOnScreen: 50});
  expect(readMaxId()).toBe(57);

  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(false);
  const first = harness.getFirstUnreadBubble(readMaxId());
  expect(first).toBe(getBubbleByMid(58));
  harness.scrollToFirstUnread(first);
  expect(readMaxId()).toBe(65);

  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(true);
});

test('nothing unread rendered and no delimiter: the press that lands on the read cursor is the last one short of the end', () => {
  const {harness, readMaxId, getBubbleByMid} = makeHarness({rendered: [50, 51, 52, 53, 54, 55, 56, 57], firstOnScreen: 50});
  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(false);
  harness.scrollToFirstUnread(getBubbleByMid(readMaxId()));
  expect(harness.shouldJumpToEndInsteadOfUnread(readMaxId())).toBe(true);
});
