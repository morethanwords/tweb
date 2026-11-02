import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import SuperIntersectionObserver from '@helpers/dom/superIntersectionObserver';
import {getMiddleware} from '@helpers/middleware';
import {makeFullMid} from '@appManagers/utils/messages/fullMid';
import '@helpers/peerIdPolyfill';

/**
 * A bubble rendered anew in place of the one shown (an edit not applied in place) takes over from it, and the one
 * replaced is taken out. Its observers - views, read metrics, an unread post's time - kept watching it: the observer
 * holds what it watches, so every bubble replaced stayed in memory with its DOM until the chat was left. Deleting a
 * bubble lets its observers go; replacing one now does the same.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const FULL_MID = makeFullMid(-100, 5);

function makeBubble() {
  const bubble = document.createElement('div');
  bubble.middlewareHelper = getMiddleware();
  bubble.timeSpan = document.createElement('span');
  bubble.append(bubble.timeSpan);
  return bubble;
}

function makeHarness() {
  const observer = new SuperIntersectionObserver();
  const callbacks = {
    unreadedObserverCallback: vi.fn(),
    unreadedContentObserverCallback: vi.fn(),
    viewsObserverCallback: vi.fn(),
    readMetricsObserverCallback: vi.fn(),
    stickerEffectObserverCallback: vi.fn(),
    messageEffectObserverCallback: vi.fn(),
    guestChatHintObserverCallback: vi.fn()
  };

  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), callbacks, {
    observer,
    unreaded: new Map(),
    unreadedContent: new Map(),
    readMetricsBubbles: new Map(),
    bubblesToReplace: new Map(),
    bubbles: {},
    hiddenLinksPendingBubbles: new Set(),
    skippedMids: new Set(),
    bubbleGroups: {getItemByBubble: () => ({mounted: true}), changeBubbleByBubble: vi.fn()},
    log: Object.assign(vi.fn(), {error: vi.fn()})
  });

  // * as a channel post's render registers it: its views, its read metrics, its time while it is unread
  const watch = (bubble: HTMLElement) => {
    observer.observe(bubble, callbacks.viewsObserverCallback);
    observer.observe(bubble, callbacks.readMetricsObserverCallback);
    harness.readMetricsBubbles.set(bubble, 5);
    observer.observe(bubble.timeSpan, callbacks.unreadedObserverCallback);
    harness.unreaded.set(bubble.timeSpan, 5);
  };

  const isWatched = (bubble: HTMLElement) => {
    return observer.has(bubble, callbacks.viewsObserverCallback) ||
      observer.has(bubble, callbacks.readMetricsObserverCallback) ||
      observer.has(bubble.timeSpan, callbacks.unreadedObserverCallback) ||
      harness.readMetricsBubbles.has(bubble) ||
      harness.unreaded.has(bubble.timeSpan);
  };

  // * a bubble rendered anew in place of `source`, waiting for its batch
  const replace = (source: HTMLElement) => {
    const candidate = makeBubble();
    watch(candidate);
    harness.bubbles[FULL_MID] = candidate;
    harness.bubblesToReplace.set(candidate, {source, fullMid: FULL_MID});
    return candidate;
  };

  // * a post on screen, watched, and a bubble rendered anew in place of it
  const source = makeBubble();
  watch(source);
  const candidate = replace(source);

  return {harness, isWatched, source, candidate};
}

test('the bubble replaced by one rendered anew is watched no more, the new one is', () => {
  const {harness, isWatched, source, candidate} = makeHarness();

  harness.commitBubbleReplacements(new Set([candidate]), undefined, []);

  expect(isWatched(source)).toBe(false);
  expect(isWatched(candidate)).toBe(true);
});

test('a render whose place another took meanwhile is watched no more, the bubble shown still is', () => {
  const {harness, isWatched, source, candidate} = makeHarness();
  // * the send's server id took the message over meanwhile
  harness.bubbles[FULL_MID] = source;

  harness.commitBubbleReplacements(new Set([candidate]), undefined, []);

  expect(isWatched(candidate)).toBe(false);
  expect(isWatched(source)).toBe(true);
});

test('a replacement called off leaves the bubble shown watched, not the render dropped', () => {
  const {harness, isWatched, source, candidate} = makeHarness();

  harness.cancelPendingBubbleReplacement(source);

  expect(isWatched(candidate)).toBe(false);
  expect(isWatched(source)).toBe(true);
});
