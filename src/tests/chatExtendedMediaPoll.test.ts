import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';

/**
 * Paid media the user has not bought is asked for again every 30 seconds while its bubbles are in the list and can be
 * seen (`messages.getExtendedMedia`; tdesktop's `ViewsManager::pollExtendedMedia` polls the items it paints): what is
 * bought - on another device, by the bot's invoice - comes as updates then. The chat asked once, 30 seconds after the
 * first such bubble, and never again for as long as the chat was open, its next peers included.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

let hidden: boolean, columnShown: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  columnShown = true;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const PEER_ID = -100;

function makeHarness(getExtendedMedia = vi.fn((peerId: PeerId, mids: number[]) => Promise.resolve([]))) {
  const appImManager: {chat?: unknown, chats: unknown[], isChatColumnShown: () => boolean} = {
    chats: [],
    isChatColumnShown: () => columnShown
  };
  const chat = {peerId: PEER_ID, appImManager};
  appImManager.chat = chat;
  appImManager.chats.push(chat);
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat,
    managers: {appMessagesManager: {getExtendedMedia}},
    extendedMediaMessages: new Set<number>(),
    bubbles: {}
  });

  // * as renderMessage registers a bubble of paid media not bought
  const render = (mid: number) => {
    harness.bubbles[`${PEER_ID}_${mid}`] = document.createElement('div');
    harness.extendedMediaMessages.add(mid);
    harness.setExtendedMediaMessagesPollInterval();
  };

  return {harness, appImManager, getExtendedMedia, render};
}

test('the paid media of the list is asked for every 30 seconds', async() => {
  const {getExtendedMedia, render} = makeHarness();
  render(5);
  render(6);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);
  expect(getExtendedMedia).toHaveBeenLastCalledWith(PEER_ID, [5, 6]);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(3);
});

test('a request that fails is made again 30 seconds later', async() => {
  const getExtendedMedia = vi.fn((peerId: PeerId, mids: number[]) => Promise.reject({type: 'MSG_ID_INVALID'}) as Promise<never[]>);
  const {render} = makeHarness(getExtendedMedia);
  render(5);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(2);
});

test('no paid media left: nothing more is asked for, until a bubble of it is rendered again', async() => {
  const {harness, getExtendedMedia, render} = makeHarness();
  render(5);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);

  // * the bubble is gone (its middleware takes its mid out)
  harness.extendedMediaMessages.delete(5);
  delete harness.bubbles[`${PEER_ID}_5`];
  await vi.advanceTimersByTimeAsync(90_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);

  render(7);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(2);
  expect(getExtendedMedia).toHaveBeenLastCalledWith(PEER_ID, [7]);
});

test('the paid media of a list on its way out is not asked for as the next chat\'s', async() => {
  const {harness, getExtendedMedia, render} = makeHarness();
  render(5);

  // * another chat opens: the bubbles are forgotten at once, the old list's middlewares go once it is taken out
  harness.bubbles = {};
  harness.chat.peerId = -200;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).not.toHaveBeenCalled();
});

test('a chat another one is opened over, and a hidden tab, ask for nothing until they are seen again', async() => {
  const {appImManager, harness, getExtendedMedia, render} = makeHarness();
  render(5);

  appImManager.chat = {};
  appImManager.chats.push(appImManager.chat);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(getExtendedMedia).not.toHaveBeenCalled();

  appImManager.chat = harness.chat;
  hidden = true;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(getExtendedMedia).not.toHaveBeenCalled();

  hidden = false;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);
});

test('a chat whose column a phone has left for the chat list asks for nothing until it is shown again', async() => {
  const {getExtendedMedia, render} = makeHarness();
  render(5);

  // * back to the chat list: the chat stays open, and its bubbles rendered, behind it
  columnShown = false;
  await vi.advanceTimersByTimeAsync(90_000);
  expect(getExtendedMedia).not.toHaveBeenCalled();

  columnShown = true;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);
});

test('a chat preview, which stands by itself over the chats, asks for its paid media', async() => {
  const {appImManager, getExtendedMedia, render} = makeHarness();
  // * not one of the chats: shown over the one that is open
  appImManager.chats.length = 0;
  appImManager.chat = {};
  appImManager.chats.push(appImManager.chat);
  // * on a phone it is held up over the chat list too
  columnShown = false;
  render(5);

  await vi.advanceTimersByTimeAsync(30_000);
  expect(getExtendedMedia).toHaveBeenCalledTimes(1);
});
