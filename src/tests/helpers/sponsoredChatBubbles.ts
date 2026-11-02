/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessagesSponsoredMessages} from '@layer';

/**
 * A `ChatBubbles` harness (its prototype, from `loadChatBubbles`) for the ads of a channel: the chat, the bookkeeping
 * of its ads as before a load, and the load itself answering `ads`. The rest is the suite's own, in `overrides`.
 */
export default function makeSponsoredHarness(
  ChatBubbles: {prototype: object},
  peerId: PeerId,
  ads: MessagesSponsoredMessages,
  overrides: Record<string, any> = {}
) {
  return Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {peerId},
    log: {bindPrefix: () => vi.fn()},
    managers: {appMessagesManager: {getSponsoredMessage: vi.fn(async() => ads)}},
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
    ...overrides
  });
}
