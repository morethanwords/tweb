import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import {makeFullMid} from '@appManagers/utils/messages/fullMid';
import type {MessagesSponsoredMessages} from '@layer';

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = -10;

const ADS: MessagesSponsoredMessages = {
  _: 'messages.sponsoredMessages',
  posts_between: 3,
  messages: [{_: 'sponsoredMessage'} as any],
  chats: [],
  users: []
};

function makeHarness(overrides: Record<string, any> = {}) {
  return Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {peerId: PEER_ID},
    log: {bindPrefix: () => vi.fn()},
    managers: {appMessagesManager: {getSponsoredMessage: vi.fn(async() => ADS)}},
    sponsoredMessagesMids: [],
    sponsoredMessages: [],
    sponsoredMessagesAvailable: [],
    sponsoredMessageEvery: 0,
    messagesSinceLastSponsored: 0,
    sponsoredAfterMids: new Map(),
    sponsoredMessagesLoaded: false,
    liveSponsoredMessages: new WeakSet(),
    scrollable: {loadedAll: {bottom: true}},
    getMiddleware: (check?: () => boolean) => () => !check || check(),
    generateSponsoredMessage: vi.fn(async(_: unknown, idx: number) => ({mid: -1 - idx})),
    deleteMessagesByIds: vi.fn(),
    renderNewMessage: vi.fn(),
    ...overrides
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Do Not Hide Ads in an open channel', () => {
  test('turned off, the shown ads and the queued ones go at once, and no load asks again', () => {
    const shown = [makeFullMid(PEER_ID, -1), makeFullMid(PEER_ID, -2)];
    const harness = makeHarness({
      sponsoredMessagesMids: shown.slice(),
      sponsoredMessagesAvailable: [{mid: -3}],
      sponsoredMessageEvery: 3,
      sponsoredMessagesLoaded: true
    });
    harness.sponsoredAfterMids.set(5, {mid: -4});

    harness.onSponsoredMessagesToggle(false);

    expect(harness.deleteMessagesByIds).toHaveBeenCalledWith(shown);
    expect(harness.sponsoredMessagesMids).toEqual([]);
    expect(harness.sponsoredMessagesAvailable).toEqual([]);
    expect(harness.sponsoredAfterMids.size).toBe(0);
    expect(harness.sponsoredMessageEvery).toBe(0);
    expect(harness.sponsoredMessagesLoaded).toBe(true);
  });

  test('turned back on, the next load asks for them again', async() => {
    const harness = makeHarness({sponsoredMessagesLoaded: true});

    harness.onSponsoredMessagesToggle(true);
    expect(harness.sponsoredMessagesLoaded).toBe(false);

    await harness.loadSponsoredMessages();
    await harness.getSponsoredMessagePromise;
    expect(harness.managers.appMessagesManager.getSponsoredMessage).toHaveBeenCalledWith(PEER_ID);
  });

  test('a load left alone puts its ads in place', async() => {
    const harness = makeHarness();

    harness.loadSponsoredMessages();
    await harness.getSponsoredMessagePromise;

    expect(harness.renderNewMessage).toHaveBeenCalledWith({mid: -1});
    expect(harness.sponsoredMessageEvery).toBe(3);
    expect(harness.sponsoredMessagesLoaded).toBe(true);
  });

  test('an answer that comes after the ads were turned off shows nothing', async() => {
    const answer = deferredPromise<MessagesSponsoredMessages>();
    const harness = makeHarness({
      managers: {appMessagesManager: {getSponsoredMessage: vi.fn(() => answer)}}
    });

    harness.loadSponsoredMessages();
    harness.onSponsoredMessagesToggle(false);
    answer.resolve(ADS);
    await flush();

    expect(harness.generateSponsoredMessage).not.toHaveBeenCalled();
    expect(harness.renderNewMessage).not.toHaveBeenCalled();
    expect(harness.sponsoredMessageEvery).toBe(0);
    expect(harness.sponsoredMessagesLoaded).toBe(true);
  });

  test('ads still being made when they were turned off are never queued', async() => {
    const made = deferredPromise<{mid: number}>();
    const harness = makeHarness({generateSponsoredMessage: vi.fn(() => made)});

    harness.loadSponsoredMessages();
    await vi.waitFor(() => expect(harness.generateSponsoredMessage).toHaveBeenCalled());
    harness.onSponsoredMessagesToggle(false);
    made.resolve({mid: -1});
    await flush();

    expect(harness.sponsoredMessagesAvailable).toEqual([]);
    expect(harness.renderNewMessage).not.toHaveBeenCalled();
    expect(harness.sponsoredMessagesLoaded).toBe(true);
  });

  test('ads turned off and on while the first ones were made register their ids once', async() => {
    // * every load makes its ads under the same local ids
    const made: ReturnType<typeof deferredPromise<{mid: number}>>[] = [];
    const harness = makeHarness({
      generateSponsoredMessage: (ChatBubbles.prototype as any).generateSponsoredMessage,
      generateLocalFirstMessage: vi.fn(() => {
        const deferred = deferredPromise<{mid: number}>();
        made.push(deferred);
        return deferred;
      })
    });

    harness.loadSponsoredMessages();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    harness.onSponsoredMessagesToggle(false);
    harness.onSponsoredMessagesToggle(true);
    harness.loadSponsoredMessages();
    await vi.waitFor(() => expect(made).toHaveLength(2));

    made[0].resolve({mid: -1});
    made[1].resolve({mid: -1});
    await harness.getSponsoredMessagePromise;
    await flush();

    const fullMid = makeFullMid(PEER_ID, -1);
    expect(harness.sponsoredMessagesMids).toEqual([fullMid]);
    expect(harness.renderNewMessage).toHaveBeenCalledTimes(1);

    harness.onSponsoredMessagesToggle(false);
    expect(harness.deleteMessagesByIds).toHaveBeenLastCalledWith([fullMid]);
  });

  test('an id held twice is taken away once', () => {
    const fullMid = makeFullMid(PEER_ID, -1);
    const harness = makeHarness({sponsoredMessagesMids: [fullMid, fullMid]});

    harness.onSponsoredMessagesToggle(false);

    expect(harness.deleteMessagesByIds).toHaveBeenCalledWith([fullMid]);
  });

  test('an ad whose render still waited when they were turned off is not put in', async() => {
    const harness = makeHarness({
      generateSponsoredMessage: (ChatBubbles.prototype as any).generateSponsoredMessage,
      generateLocalFirstMessage: vi.fn(async() => ({_: 'message', mid: -1, pFlags: {local: true, sponsored: true}})),
      safeRenderMessage: vi.fn()
    });
    const ad = await harness.generateSponsoredMessage({_: 'sponsoredMessage'}, 0, () => true);

    // * as `performHistoryResult` comes to it once its awaits are over
    harness.processLocalMessageRender(ad);
    expect(harness.safeRenderMessage).toHaveBeenCalledTimes(1);

    harness.onSponsoredMessagesToggle(false);
    harness.processLocalMessageRender(ad);
    expect(harness.safeRenderMessage).toHaveBeenCalledTimes(1);
  });

  test('an ad made for a load that was dropped is never rendered', async() => {
    const harness = makeHarness({
      generateSponsoredMessage: (ChatBubbles.prototype as any).generateSponsoredMessage,
      generateLocalFirstMessage: vi.fn(async() => ({_: 'message', mid: -1, pFlags: {local: true, sponsored: true}})),
      safeRenderMessage: vi.fn()
    });
    const ad = await harness.generateSponsoredMessage({_: 'sponsoredMessage'}, 0, () => false);

    harness.processLocalMessageRender(ad);
    expect(harness.safeRenderMessage).not.toHaveBeenCalled();
  });
});
