import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import deferredPromise from '@helpers/cancellablePromise';
import {ChatType} from '@components/chat/chatType';
import {SliceEnd} from '@helpers/slicedArray';
import '@helpers/peerIdPolyfill';

/**
 * The zoom a list rendered anew comes in with (`animateAsLadder`) is held back till the list of the peer change is
 * mounted, and a jump's highlights wait for it (`waitForJumpToSettle`). One that comes after the list is mounted -
 * the fresh page of a chat opened from its cache, rendered while the change still waits for the chat's dialog -
 * comes in at once: held back then, nothing brought it in, and the highlights waited for good.
 */

vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => true}}));

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

function makeHarness() {
  const firstScreen = deferredPromise<void>();
  const freshPage = deferredPromise<any>();
  // * the peer change, still waiting for the chat's dialog after its list is mounted
  const peerChange = deferredPromise<void>();
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      type: ChatType.Chat,
      peerId: 10,
      isBroadcast: false,
      setPeerPromise: peerChange,
      getMessage: () => ({_: 'message', pFlags: {}}),
      getHistoryStorage: () => ({history: {
        slice: {isEnd: (end: SliceEnd) => end === SliceEnd.Bottom},
        sliceMe: (): any => ({slice: []})
      }})
    },
    isFirstLoad: true,
    requestHistory: async() => ({cached: false, result: freshPage}),
    getRenderedHistory: (): any[] => [],
    renderFirstScreen: () => ({promise: firstScreen}),
    performHistoryResult: async() => {
      harness.messagesQueueOnRenderAdditional?.();
    },
    loadMoreHistory: vi.fn(),
    log: Object.assign(vi.fn(), {bindPrefix: () => Object.assign(vi.fn(), {warn: vi.fn()})})
  });

  return {harness, firstScreen, freshPage};
}

test('the zoom of the fresh page rendered after the list is mounted comes in, and the jump\'s highlights wait no more', async() => {
  const {harness, firstScreen, freshPage} = makeHarness();
  const result = await harness.getHistory(undefined, true, false, '10_10');
  harness.messagesQueueOnRenderAdditional();
  firstScreen.resolve();
  await result.promise;

  // * the list is mounted
  harness.startHeldLadder();
  let settled = false;
  harness.waitForJumpToSettle(Promise.resolve()).then(() => settled = true);

  // * the fresh page renders while the peer change still waits for the dialog
  freshPage.resolve({history: [9]});
  await result.waitPromise;
  await new Promise((resolve) => setTimeout(resolve));

  expect(harness.resolveLadderAnimation).toBeUndefined();
  expect(settled).toBe(true);
});

test('the zoom of a render before the list is mounted waits for it', async() => {
  const {harness, firstScreen, freshPage} = makeHarness();
  const result = await harness.getHistory(undefined, true, false, '10_10');
  harness.messagesQueueOnRenderAdditional();
  firstScreen.resolve();
  await result.promise;

  let settled = false;
  harness.waitForJumpToSettle(Promise.resolve()).then(() => settled = true);
  freshPage.resolve({history: [9]});
  await result.waitPromise;
  await new Promise((resolve) => setTimeout(resolve));

  expect(harness.resolveLadderAnimation).toBeTypeOf('function');
  expect(settled).toBe(false);

  harness.startHeldLadder();
  await new Promise((resolve) => setTimeout(resolve));

  expect(harness.resolveLadderAnimation).toBeUndefined();
  expect(settled).toBe(true);
});
