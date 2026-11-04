import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import deferred from '@/tests/helpers/deferred';
import {ChatType} from '@components/chat/chatType';
import pause from '@helpers/schedulers/pause';
import type {Message} from '@layer';
import '@helpers/peerIdPolyfill';

/**
 * What a chat's messages seen sends to read them.
 *
 * A message read once it is seen waits for the window's focus first. When the list had no message of the chat's own
 * left by then (the one seen deleted meanwhile), working out how far to read threw, and the read of this chat, latched
 * on the promise that threw, was never sent again until the chat changed. Nothing that throws there keeps it latched.
 *
 * A mention seen reads the message it is in. A service message that mentions the user and takes no reactions threw
 * as it was rendered, looking for the message its reactions live on, and the bubble was lost.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let idleController: typeof import('@helpers/idleController').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  idleController = (await import('@helpers/idleController')).default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = -100;

function makeHarness({historyMaxId = (): number => 4} = {}) {
  let focus: () => void;
  vi.spyOn(idleController, 'getFocusPromise').mockImplementation(() => {
    const focused = deferred();
    focus = focused.resolve;
    return focused.promise;
  });

  const messages = new Map<number, Message.message | Message.messageService>();
  const readHistory = vi.fn((options: {peerId: PeerId, maxId: number}) => Promise.resolve());
  const readMessages = vi.fn((peerId: PeerId, mids: number[]) => Promise.resolve());
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      type: ChatType.Chat,
      peerId: PEER_ID,
      isPreview: false,
      getHistoryMaxId: historyMaxId,
      getMessage: (mid: number) => messages.get(mid)
    },
    managers: {appMessagesManager: {readHistory, readMessages}},
    log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
    scrollable: {loadedAll: {bottom: true}},
    // * no message of the chat's own is in the list
    bubbleGroups: {groups: []},
    observer: {observe: vi.fn(), unobserve: vi.fn()},
    unreaded: new Map(),
    unreadedContent: new Map(),
    unreadedSeen: new Set(),
    unreadedContentSeen: new Set(),
    getMiddleware: () => () => true
  });

  // * a message rendered unread, then seen
  const see = (mid: number) => {
    const bubble = document.createElement('div');
    harness.setUnreadObserver('history', bubble, mid);
    harness.onUnreadedInViewport('history', bubble, mid);
  };

  return {harness, messages, readHistory, readMessages, see, focus: () => focus()};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a message seen reads the chat', () => {
  test('when the list has no message of the chat left by the focus, the chat is read up to it', async() => {
    const {harness, readHistory, see, focus} = makeHarness();
    // * the only unread message, seen while the window had no focus: deleted before it came back
    see(5);
    focus();
    await pause(0);

    expect(readHistory).toHaveBeenCalledTimes(1);
    expect(readHistory.mock.calls[0][0]).toMatchObject({peerId: PEER_ID, maxId: 5});
    expect(harness.readPromise).toBeUndefined();
    expect(harness.log.error).not.toHaveBeenCalled();
  });

  test('a read that fails to be worked out leaves the next message seen to read the chat', async() => {
    const historyMaxId = vi.fn((): number => {
      throw new Error('history is gone');
    });
    const {harness, readHistory, see, focus} = makeHarness({historyMaxId});
    see(5);
    focus();
    await pause(0);
    expect(readHistory).not.toHaveBeenCalled();
    expect(harness.readPromise).toBeUndefined();

    historyMaxId.mockImplementation(() => 4);
    see(6);
    focus();
    await pause(0);

    expect(readHistory).toHaveBeenCalledTimes(1);
    expect(readHistory.mock.calls[0][0]).toMatchObject({peerId: PEER_ID, maxId: 6});
    expect(harness.readPromise).toBeUndefined();
  });
});

describe('a mention seen reads its message', () => {
  const service = (pFlags: Message.messageService['pFlags']): Message.messageService => ({
    _: 'messageService',
    id: 10,
    mid: 10,
    peerId: PEER_ID,
    peer_id: {_: 'peerChannel', channel_id: 100},
    date: 0,
    action: {_: 'messageActionPinMessage'},
    pFlags
  });

  test('a service message that takes no reactions is watched, and read once seen', async() => {
    const {harness, messages, readMessages, focus} = makeHarness();
    const message = service({mentioned: true, media_unread: true});
    messages.set(message.mid, message);
    const bubble = document.createElement('div');

    harness.observeUnreadContent(bubble, message);
    expect(harness.unreadedContent.get(bubble)).toBe(10);

    harness.onUnreadedInViewport('content', bubble, harness.unreadedContent.get(bubble));
    focus();
    await pause(0);
    expect(readMessages).toHaveBeenCalledWith(PEER_ID, [10]);
  });

  test('a mention already read, and one of an ephemeral message, are not watched', () => {
    const {harness} = makeHarness();
    const read = service({mentioned: true});
    const ephemeral = {
      _: 'message',
      id: 11,
      mid: 11,
      peerId: PEER_ID,
      peer_id: {_: 'peerChannel', channel_id: 100},
      date: 0,
      message: '@me',
      ephemeral_id: 1,
      ephemeral_receiver_id: 1,
      pFlags: {ephemeral: true, mentioned: true, media_unread: true}
    } as Message.message;

    for(const message of [read, ephemeral]) {
      harness.observeUnreadContent(document.createElement('div'), message);
    }

    expect(harness.unreadedContent.size).toBe(0);
    expect(harness.observer.observe).not.toHaveBeenCalled();
  });
});
