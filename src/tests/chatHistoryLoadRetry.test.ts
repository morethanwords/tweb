import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {getMiddleware} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import deferred from '@/tests/helpers/deferred';
import {ChatType} from '@components/chat/chatType';
import '@helpers/peerIdPolyfill';

/**
 * A page of history the list asks for as it is scrolled to an end (`loadMoreHistory`) is one load at a time per end:
 * the next one waits for the one on its way (`getHistoryTopPromise` / `getHistoryBottomPromise`). A load that fails -
 * the server refuses it (a flood wait longer than the client waits out, an error of the request) - is over all the
 * same: the next scroll to that end asks again, as it would after a load that came. Kept as "on its way", it stopped
 * every later load of that end until the chat was opened anew.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

function makeHarness() {
  const middlewareHelper = getMiddleware();
  const loads: {top: boolean, fail: (error: unknown) => void, succeed: () => void}[] = [];
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      type: ChatType.Chat,
      peerId: 10
    },
    middlewareHelper,
    scrollable: {loadedAll: {top: false, bottom: false}, onScroll: vi.fn()},
    getRenderedHistory: (): string[] => ['10_7', '10_8'],
    getHistory: vi.fn((maxId: string, reverse: boolean) => {
      const {promise, resolve, reject} = deferred();
      loads.push({top: reverse, fail: reject, succeed: resolve});
      return Promise.resolve({cached: false, promise, waitPromise: promise});
    }),
    log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn(), bindPrefix: () => vi.fn()})
  });

  return {harness, loads};
}

test.each([true, false])('a failed load of an end (top: %s) lets the next scroll there load again', async(top) => {
  const {harness, loads} = makeHarness();

  harness.loadMoreHistory(top);
  expect(loads).toHaveLength(1);

  // * one on its way: a scroll meanwhile does not ask for another
  harness.loadMoreHistory(top);
  expect(loads).toHaveLength(1);

  loads[0].fail({type: 'FLOOD_WAIT_120', code: 420});
  await pause(0);

  harness.loadMoreHistory(top);
  expect(loads).toHaveLength(2);
  expect(loads[1].top).toBe(top);
});

test('a load taken over by the next one leaves that one in place when it fails', async() => {
  const {harness, loads} = makeHarness();

  harness.loadMoreHistory(true);
  const taken = loads[0];
  // * a jump or a viewport slice forgets the load on its way, and the next scroll makes another
  harness.getHistoryTopPromise = undefined;
  harness.loadMoreHistory(true);
  expect(loads).toHaveLength(2);

  taken.fail(new Error('PEER_CHANGED'));
  await pause(0);

  // * the second one is still on its way
  harness.loadMoreHistory(true);
  expect(loads).toHaveLength(2);
});

test('a load of a chat left meanwhile changes nothing when it fails', async() => {
  const {harness, loads} = makeHarness();

  harness.loadMoreHistory(true);
  const promise = harness.getHistoryTopPromise;
  harness.middlewareHelper.clean();
  loads[0].fail({type: 'CHANNEL_PRIVATE', code: 400});
  await pause(0);

  expect(harness.getHistoryTopPromise).toBe(promise);
});
