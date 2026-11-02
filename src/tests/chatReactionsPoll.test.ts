import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {getMiddleware} from '@helpers/middleware';
import {makeFullMid, FullMid, splitFullMid} from '@appManagers/utils/messages/fullMid';
import '@helpers/peerIdPolyfill';

/**
 * The reactions of a channel's or a supergroup's messages on screen are asked for again every 10 seconds
 * (`messages.getMessagesReactions`). The next round was set off only by a request that answered: one the server
 * refused (a flood wait the client does not wait out, any error of it) stopped the refresh for as long as the chat
 * stayed open.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const PEER_ID = -100;

function makeHarness(getMessagesReactions: (peerId: PeerId, mids: number[]) => Promise<void>) {
  const middlewareHelper = getMiddleware();
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      peerId: PEER_ID,
      isChannel: true,
      // * a service message is asked for as it is (a message by its album's first one)
      getMessage: (fullMid: FullMid) => ({_: 'messageService', peerId: PEER_ID, mid: splitFullMid(fullMid).mid})
    },
    middlewareHelper,
    managers: {appReactionsManager: {getMessagesReactions: vi.fn(getMessagesReactions)}},
    getRenderedHistory: (): FullMid[] => [makeFullMid(PEER_ID, 7), makeFullMid(PEER_ID, 8)]
  });

  return {harness, middlewareHelper, getMessagesReactions: harness.managers.appReactionsManager.getMessagesReactions};
}

test('a refused request does not stop the refresh: the next one goes 10 seconds later', async() => {
  let calls = 0;
  const {harness, getMessagesReactions} = makeHarness(() => ++calls === 1 ? Promise.reject({type: 'FLOOD_WAIT_120', code: 420}) : Promise.resolve());

  harness.setFetchReactionsInterval(Promise.resolve());
  await vi.advanceTimersByTimeAsync(500);
  expect(getMessagesReactions).toHaveBeenCalledTimes(1);
  expect(getMessagesReactions).toHaveBeenLastCalledWith(PEER_ID, [7, 8]);

  await vi.advanceTimersByTimeAsync(10_000);
  expect(getMessagesReactions).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(10_000);
  expect(getMessagesReactions).toHaveBeenCalledTimes(3);
});

test('the chat left: the refresh stops', async() => {
  const {harness, middlewareHelper, getMessagesReactions} = makeHarness(() => Promise.resolve());

  harness.setFetchReactionsInterval(Promise.resolve());
  await vi.advanceTimersByTimeAsync(500);
  expect(getMessagesReactions).toHaveBeenCalledTimes(1);

  middlewareHelper.clean();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getMessagesReactions).toHaveBeenCalledTimes(1);
});
