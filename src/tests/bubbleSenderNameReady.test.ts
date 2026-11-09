import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT, makeMessageBubble} from '@/tests/helpers/chatBubbles';
import {getMiddleware} from '@helpers/middleware';
import {ChatType} from '@components/chat/chatType';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import '@helpers/peerIdPolyfill';
import type {Message} from '@layer';

/**
 * A bubble is attached, and the chat keeps its scroll, only once the loads its render reports have settled
 * (`promises`). The sender's name comes after an await (its text, its emoji status), so it is one of them: a
 * bubble attached before it gets its name a frame later, a line taller, and moves everything below it.
 */

const pendingTitles = new Map<PeerId, CancellablePromise<string>>();
vi.mock('@components/wrappers/getPeerTitle', () => ({
  default: (options: {peerId: PeerId}) => {
    let deferred = pendingTitles.get(options.peerId);
    if(!deferred) pendingTitles.set(options.peerId, deferred = deferredPromise());
    return deferred;
  }
}));
vi.mock('@components/generateTitleIcons', () => ({default: async() => ({elements: [] as HTMLElement[]})}));

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  (await import('@stores/appState')).setAppStateSilent('appConfig', {});
  // * the bubble's time is formatted in the language's locale
  await (await import('@lib/langPack')).default.getCacheLangPackAndApply();
}, LOAD_CHAT_BUBBLES_TIMEOUT);

afterEach(() => {
  pendingTitles.clear();
  document.body.replaceChildren();
});

const PEER_ID = -100 as PeerId;
const SENDER_ID = 5 as PeerId;

function makeHarness() {
  const chat: any = {
    type: ChatType.Chat,
    peerId: PEER_ID,
    isLikeGroup: true,
    isAnyGroup: true,
    isOurMessage: () => false,
    isOutMessage: () => false,
    isForwardOfForward: () => false,
    canSend: () => false,
    canChooseTheme: () => false,
    getPostAuthor: (): undefined => undefined,
    getMessageByPeer: (): undefined => undefined,
    appImManager: {customEmojiSize: undefined},
    getMessage: (): undefined => undefined
  };

  return Object.assign(Object.create(ChatBubbles.prototype), {
    chat,
    contexts: new Map(),
    updateLocalOnEdit: new Map(),
    solidMessageBodies: new Map(),
    pendingSolidMessageBodyLayouts: new Set(),
    laidOutSolidMessageBodies: new WeakSet(),
    messageLinkPolicyStates: new Set(),
    hiddenLinksPendingBubbles: new Set(),
    spoilerOverlayPromises: new WeakMap(),
    bubbleTextHighlights: new WeakMap(),
    unreadOut: new Set(),
    unreaded: new Map(),
    unreadedContent: new Map(),
    viewsMids: new Set(),
    readMetricsBubbles: new Map(),
    extendedMediaMessages: new Set(),
    skippedMids: new Set(),
    sponsoredAfterMids: new Map(),
    webPageClickCallbacks: new Map(),
    needUpdate: [],
    observer: {observe: vi.fn(), unobserve: vi.fn()},
    sendFlights: {getFlight: (): undefined => undefined},
    getRenderReadMaxId: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
    log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()})
  });
}

function settled(promise: Promise<unknown>) {
  let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
  promise.then(() => state = 'fulfilled', () => state = 'rejected');
  return async() => {
    for(let i = 0; i < 10; ++i) await Promise.resolve();
    return state;
  };
}

/** A group's message from someone else: the first of its sender's, so it shows their name */
async function renderGroupMessage(changes: Partial<Message.message> = {}) {
  const message = {
    _: 'message',
    mid: 1,
    id: 1,
    peerId: PEER_ID,
    fromId: SENDER_ID,
    from_id: {_: 'peerUser', user_id: SENDER_ID.toUserId()},
    date: 0,
    pFlags: {},
    message: 'hello',
    ...changes
  } as any as Message.message;

  const bubble = makeMessageBubble(PEER_ID, message.mid);
  const result = await makeHarness().renderMessage({
    message,
    bubble,
    middleware: getMiddleware().get()
  });

  return {bubble, loads: settled(Promise.all(result.promises))};
}

test('the render of a group message waits for its sender\'s name', async() => {
  const {bubble, loads} = await renderGroupMessage();

  const name = bubble.querySelector<HTMLElement>('.name .peer-title');
  expect(name).not.toBeNull();
  expect(name.textContent).toBe('');
  expect(await loads()).toBe('pending');

  pendingTitles.get(SENDER_ID).resolve('Alice');
  expect(await loads()).toBe('fulfilled');
  expect(bubble.querySelector('.name').textContent).toContain('Alice');
});

test('a name that fails to render does not end the wait for the bubble\'s other loads', async() => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const {loads} = await renderGroupMessage();
  expect(await loads()).toBe('pending');

  pendingTitles.get(SENDER_ID).reject(new Error('no title'));
  expect(await loads()).toBe('fulfilled');
  expect(consoleError).toHaveBeenCalled();
  consoleError.mockRestore();
});

test('the render of a group message replying with a quote waits for the name of the one it replies to', async() => {
  const REPLIED_ID = 7 as PeerId;
  // * a reply to someone else's message, quoting several lines of it: the quote is taller than a reply's least height,
  // * so a name line drawn after the bubble is attached would make it grow
  const {bubble, loads} = await renderGroupMessage({
    reply_to: {
      _: 'messageReplyHeader',
      pFlags: {quote: true},
      reply_from: {_: 'messageFwdHeader', pFlags: {}, from_id: {_: 'peerUser', user_id: REPLIED_ID.toUserId()}, date: 0},
      quote_text: 'first line\nsecond line\nthird line'
    } as any
  });

  const reply = bubble.querySelector<HTMLElement>('.reply');
  expect(reply).not.toBeNull();
  pendingTitles.get(SENDER_ID).resolve('Alice');
  expect(await loads()).toBe('pending');

  pendingTitles.get(REPLIED_ID).resolve('Bob');
  expect(await loads()).toBe('fulfilled');
  expect(reply.textContent).toContain('Bob');
});
