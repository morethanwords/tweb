import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import type {Message} from '@layer';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import {ChatType} from '@components/chat/chatType';
import apiManagerProxy from '@lib/apiManagerProxy';

/**
 * What changes a message while its bubble is on its way to the screen, the rule written before the code: the
 * bubble ends up showing the message as it is — an edit is never lost, an album shows every item it has
 * however its items arrive, and a render that is asked again while it runs is run again once it is done.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

afterEach(() => {
  document.body.replaceChildren();
  vi.mocked(apiManagerProxy.getMessagesByGroupedId).mockReset();
});

const PEER_ID = 10 as PeerId;

function photoMessage(mid: number, photoId: string, groupedId?: string): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    peer_id: {_: 'peerUser', user_id: PEER_ID},
    peerId: PEER_ID,
    date: 1,
    message: '',
    grouped_id: groupedId,
    media: {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photoEmpty', id: photoId}}
  };
}

describe('a render asked for while the same message is being rendered', () => {
  function setup() {
    const chatInner = document.createElement('div');
    document.body.append(chatInner);
    const middlewareHelper = getMiddleware();
    const chatInnerMiddlewareHelper = getMiddleware().get().create();
    const bubbles: Record<string, HTMLElement> = {};
    const renders: Array<{message: Message.message, done: () => void}> = [];
    /** the messages as the mirror has them */
    const mirror = new Map<number, Message.message>();
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      renderingMessages: new Set<string>(),
      pendingRerenders: new Map(),
      bubbles,
      skippedMids: new Set<string>(),
      bubblesToReplace: new Map(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      bubbleGroups: {changeBubbleByBubble: vi.fn(), getItemByBubble: vi.fn()},
      chat: {isBotforum: false, peerId: PEER_ID, getMessageByPeer: (_: PeerId, mid: number) => mirror.get(mid)},
      chatInner,
      chatInnerMiddlewareHelper,
      managers: {},
      getMiddleware: () => middlewareHelper.get(),
      renderMessage: vi.fn(({bubble, message, reverse}) => new Promise((resolve) => {
        renders.push({message, done: () => resolve({bubble, message, reverse, promises: []})});
      })),
      renderMessagesQueue: vi.fn(),
      log: {error: vi.fn()}
    }) as any;

    return {harness, bubbles, renders, mirror};
  }

  test('runs again on its bubble once that render is done, with the latest message only', async() => {
    const {harness, bubbles, renders} = setup();
    const first = harness.safeRenderMessage({message: photoMessage(100, 'a')});
    const bubble = bubbles['10_100'];

    // two edits while the first render runs
    harness.safeRenderMessage({message: photoMessage(100, 'b'), bubble});
    harness.safeRenderMessage({message: photoMessage(100, 'c'), bubble});
    expect(renders.map(({message}) => (message.media as any).photo.id)).toEqual(['a']);

    renders[0].done();
    await first;

    expect(renders.map(({message}) => (message.media as any).photo.id)).toEqual(['a', 'c']);
    expect(harness.bubblesToReplace.get(bubbles['10_100']).source).toBe(bubble);
  });

  test('runs on the message as it is by then: an edit applied in place meanwhile is newer', async() => {
    const {harness, bubbles, renders, mirror} = setup();
    const first = harness.safeRenderMessage({message: photoMessage(100, 'a')});
    const bubble = bubbles['10_100'];

    harness.safeRenderMessage({message: photoMessage(100, 'b'), bubble});
    // then an edit the body took in place, past the queue
    mirror.set(100, {...photoMessage(100, 'a'), message: 'a newer caption'});

    renders[0].done();
    await first;

    expect(renders[1].message).toBe(mirror.get(100));
  });

  test('is not run twice when it is a new render of the same message', async() => {
    const {harness, renders} = setup();
    const first = harness.safeRenderMessage({message: photoMessage(100, 'a')});
    harness.safeRenderMessage({message: photoMessage(100, 'a')});

    renders[0].done();
    await first;

    expect(renders).toHaveLength(1);
  });
});

describe('an album item that comes after its album has a bubble', () => {
  function setup(type = ChatType.Chat) {
    const bubbles: Record<string, HTMLElement> = {};
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      bubbles,
      skippedMids: new Set<string>(),
      chat: {type, peerId: PEER_ID},
      safeRenderMessage: vi.fn(() => Promise.resolve()),
      updateGroupedMessage: vi.fn()
    }) as any;
    const albumBubble = (fullMid: string, length: number) => {
      const bubble = document.createElement('div');
      (bubble as any).groupedLength = length;
      bubbles[fullMid] = bubble;
      return bubble;
    };
    /** the album as the mirror has it now (the only `apiManagerProxy` call on this path) */
    const albumIs = (...messages: Message.message[]) => {
      vi.mocked(apiManagerProxy.getMessagesByGroupedId).mockReturnValueOnce(messages);
    };

    return {harness, bubbles, albumBubble, albumIs};
  }

  test('renders that bubble again with every item there is', () => {
    const {harness, albumBubble, albumIs} = setup();
    const bubble = albumBubble('10_100', 1);
    const [first, second] = [photoMessage(100, 'a', 'g'), photoMessage(101, 'b', 'g')];
    albumIs(first, second);

    expect(harness.renderGroupedItem(second)).toBeInstanceOf(Promise);
    expect(harness.safeRenderMessage).toHaveBeenCalledWith({message: first, reverse: true, bubble});
  });

  test('leaves a bubble that has it already', () => {
    const {harness, albumBubble, albumIs} = setup();
    albumBubble('10_100', 2);
    const [first, second] = [photoMessage(100, 'a', 'g'), photoMessage(101, 'b', 'g')];
    albumIs(first, second);

    expect(harness.renderGroupedItem(second)).toBe(false);
    expect(harness.safeRenderMessage).not.toHaveBeenCalled();
  });

  test('moves the bubble and its grouping item to an item older than the one it went by', () => {
    const {harness, bubbles, albumBubble, albumIs} = setup();
    const bubble = albumBubble('10_101', 1);
    const [first, second] = [photoMessage(100, 'a', 'g'), photoMessage(101, 'b', 'g')];
    albumIs(first, second);

    harness.renderGroupedItem(first);

    expect(bubbles['10_101']).toBeUndefined();
    expect(harness.updateGroupedMessage).toHaveBeenCalledWith(bubble, first);
    expect(harness.safeRenderMessage).toHaveBeenCalledWith({message: first, reverse: true, bubble});
  });

  test('keeps the grouping item of a bubble whose first item stays', () => {
    const {harness, albumBubble, albumIs} = setup();
    albumBubble('10_100', 1);
    const [first, second] = [photoMessage(100, 'a', 'g'), photoMessage(101, 'b', 'g')];
    albumIs(first, second);

    harness.renderGroupedItem(second);

    expect(harness.updateGroupedMessage).not.toHaveBeenCalled();
  });

  test.each([
    ['a message of no album', ChatType.Chat, undefined],
    ['the pinned list, where items go one by one', ChatType.Pinned, 'g']
  ] as const)('does nothing for %s', (_, type, groupedId) => {
    const {harness, albumBubble, albumIs} = setup(type);
    albumBubble('10_100', 1);
    albumIs(photoMessage(100, 'a', 'g'), photoMessage(101, 'b', 'g'));

    expect(harness.renderGroupedItem(photoMessage(101, 'b', groupedId))).toBeUndefined();
    expect(harness.safeRenderMessage).not.toHaveBeenCalled();
  });
});
