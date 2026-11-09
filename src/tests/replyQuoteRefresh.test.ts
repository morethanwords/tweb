import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import deferred from '@/tests/helpers/deferred';
import pause from '@helpers/schedulers/pause';
import type {Message, MessageReplyHeader} from '@layer';
import type {MessageRender as MessageRenderType} from '@components/chat/messageRender';

// * a refresh of a reply quote (`MessageRender.setReply` with `fromUpdate`, as `ChatBubbles.updateMessageReply` makes
// * it when the message replied to is downloaded): it puts the new quote in only once it shows all of itself, and puts
// * none in when the message replied to, downloaded anew, says the same

const mirror = vi.hoisted(() => ({original: undefined as any, album: [] as any[]}));
const quotes = vi.hoisted(() => ({made: [] as {container: HTMLElement, options: any}[], hold: undefined as Promise<void>}));

// * the message replied to, and its album, as the mirror has them
vi.mock('@lib/apiManagerProxy', () => ({default: {
  addEventListener: () => {},
  getState: () => Promise.resolve({}),
  getMessageByPeer: () => mirror.original,
  getMessagesByGroupedId: () => mirror.album
}}));
// * a name in a quote: what it waits for to be drawn is what the test holds
const titles = vi.hoisted(() => ({hold: undefined as Promise<void>}));
vi.mock('@components/peerTitle', () => ({createPeerTitleElement: (options: any, loadPromises?: Promise<any>[]) => {
  if(titles.hold) loadPromises?.push(titles.hold);
  return document.createElement('span');
}}));
vi.mock('@lib/accounts/bindManagersToAccount', async(importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/accounts/bindManagersToAccount')>()),
  bindManagersToSession: (managers: any) => managers
}));
// * a quote made: what it waits for to show all of itself is what the test holds
vi.mock('@components/wrappers/reply', () => ({default: (options: any) => {
  const container = document.createElement('div');
  container.classList.add('reply');
  if(quotes.hold) options.loadPromises?.push(quotes.hold);
  quotes.made.push({container, options});
  return {container, fillPromise: Promise.resolve()};
}}));

let MessageRender: typeof MessageRenderType;

beforeAll(async() => {
  stubBrowserGlobals();
  ({MessageRender} = await import('@components/chat/messageRender'));
});

const PEER_ID = -100 as PeerId;

function makeOriginal(changes: Partial<Message.message> = {}): Message.message {
  return {
    _: 'message',
    pFlags: {post: true},
    id: 1,
    mid: 1,
    peerId: PEER_ID,
    fromId: PEER_ID,
    date: 1000,
    message: 'Test documentation for Bot API',
    views: 10,
    media: {
      _: 'messageMediaPhoto',
      pFlags: {},
      photo: {_: 'photo', pFlags: {}, id: '5', access_hash: '6', date: 900, file_reference: [1, 2], sizes: [], dc_id: 2}
    },
    ...changes
  } as Message.message;
}

function makeReply(): Message.message {
  return {
    _: 'message',
    pFlags: {post: true},
    id: 2,
    mid: 2,
    peerId: PEER_ID,
    date: 1001,
    message: 'Telegram Bot API updated',
    reply_to_mid: 1,
    reply_to: {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: 1} as MessageReplyHeader
  } as Message.message;
}

const middleware = Object.assign(() => true, {onClean: () => {}, onDestroy: () => {}}) as any;

function makeBubble() {
  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  const content = document.createElement('div');
  content.classList.add('bubble-content');
  bubble.append(content);
  return bubble;
}

const common = {
  chat: {animationGroup: 'chat'} as any,
  middleware,
  lazyLoadQueue: undefined as any,
  isStandaloneMedia: false,
  isOut: false
};

// * the quote the bubble was rendered with
async function render(bubble: HTMLElement) {
  const content = bubble.querySelector<HTMLElement>('.bubble-content');
  return MessageRender.setReply({
    ...common,
    bubble,
    bubbleContainer: content,
    message: makeReply(),
    needUpdate: [],
    appendCallback: (container) => content.prepend(container)
  });
}

function refresh(bubble: HTMLElement, swap: (callback: () => void) => void) {
  return MessageRender.setReply({...common, bubble, message: makeReply(), needUpdate: [], fromUpdate: true, swap});
}

describe('a reply quote refreshed', () => {
  beforeEach(() => {
    quotes.made.length = 0;
    quotes.hold = undefined;
    titles.hold = undefined;
    mirror.album = [];
  });

  it('stays as it is when the message replied to comes again saying the same', async() => {
    const bubble = makeBubble();
    mirror.original = makeOriginal();
    const shown = await render(bubble);

    // * a copy of its own, with what a download renews: its counters, its date, its files' references
    mirror.original = makeOriginal({
      views: 11,
      date: 1001,
      pFlags: {post: true, pinned: true},
      replies: {_: 'messageReplies', pFlags: {}, replies: 8, replies_pts: 2},
      media: {
        _: 'messageMediaPhoto',
        pFlags: {},
        photo: {_: 'photo', pFlags: {}, id: '5', access_hash: '6', date: 901, file_reference: [3, 4], sizes: [], dc_id: 2}
      }
    });
    const swap = vi.fn((callback: () => void) => callback());
    expect(await refresh(bubble, swap)).toBe(shown);
    expect(swap).not.toHaveBeenCalled();
    expect(bubble.querySelector('.reply')).toBe(shown);
  });

  it('changes when what it shows of the message replied to changed', async() => {
    const bubble = makeBubble();
    mirror.original = makeOriginal();
    const shown = await render(bubble);

    mirror.original = makeOriginal({message: 'Test documentation for Bot API, edited'});
    const swap = vi.fn((callback: () => void) => callback());
    const made = await refresh(bubble, swap);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(made).not.toBe(shown);
    expect(bubble.querySelector('.reply')).toBe(made);
  });

  it('changes when a date its text shows changed', async() => {
    const bubble = makeBubble();
    const makeDated = (date: number) => makeOriginal({
      entities: [{_: 'messageEntityFormattedDate', pFlags: {short_date: true}, offset: 0, length: 4, date}]
    });
    mirror.original = makeDated(1700000000);
    const shown = await render(bubble);

    mirror.original = makeDated(1800000000);
    const swap = vi.fn((callback: () => void) => callback());
    const made = await refresh(bubble, swap);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(made).not.toBe(shown);
  });

  it('changes when the caption of its album, held by another of the album\'s messages, changed', async() => {
    const bubble = makeBubble();
    const makeAlbum = (caption: string) => {
      const original = makeOriginal({grouped_id: '7', message: ''});
      const captioned = makeOriginal({grouped_id: '7', id: 3, mid: 3, message: caption});
      mirror.original = original;
      mirror.album = [original, captioned];
    };
    makeAlbum('Test documentation for Bot API');
    const shown = await render(bubble);

    // * the album downloaded anew, saying the same
    makeAlbum('Test documentation for Bot API');
    const swap = vi.fn((callback: () => void) => callback());
    expect(await refresh(bubble, swap)).toBe(shown);
    expect(swap).not.toHaveBeenCalled();

    makeAlbum('Test documentation for Bot API, edited');
    const made = await refresh(bubble, swap);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(made).not.toBe(shown);
    expect(bubble.querySelector('.reply')).toBe(made);
  });

  it.each([
    ['is put in only once the new one shows all of itself', quotes],
    ['is put in only once its author\'s name is drawn', titles]
  ])('%s', async(_name, held) => {
    const bubble = makeBubble();
    mirror.original = makeOriginal();
    await render(bubble);

    const release = deferred();
    held.hold = release.promise;
    mirror.original = makeOriginal({message: 'Test documentation for Bot API, edited'});
    const swap = vi.fn((callback: () => void) => callback());
    const refreshed = refresh(bubble, swap);

    await vi.waitFor(() => expect(quotes.made).toHaveLength(2));
    await pause(20);
    expect(swap).not.toHaveBeenCalled();

    release.resolve();
    const made = await refreshed;
    expect(swap).toHaveBeenCalledTimes(1);
    expect(bubble.querySelector('.reply')).toBe(made);
  });
});
