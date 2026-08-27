import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {BubbleElementAddons} from '@components/chat/types';

const mocks = vi.hoisted(() => ({
  isForum: vi.fn(),
  isBotforum: vi.fn(),
  isMonoforum: vi.fn()
}));

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});

vi.mock('@lib/apiManagerProxy', () => ({
  default: mocks
}));

vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: class SolidJSHotReloadGuardProvider {}
}));

vi.mock('@components/chat/bubbleParts/chatThreadSeparator', () => {
  class MockChatThreadSeparator extends HTMLElement {
    public fedProps: Record<string, unknown> = {};
    public HotReloadGuard: unknown;

    public feedProps(props: Record<string, unknown>) {
      Object.assign(this.fedProps, props);
    }
  }

  customElements.define('mock-chat-thread-separator', MockChatThreadSeparator);
  return {default: MockChatThreadSeparator};
});

import updateChatThreadSeparators from '@components/chat/bubbleParts/updateChatThreadSeparators';

type TestItem = {
  bubble: HTMLElement & BubbleElementAddons,
  message: any
};

function makeItem(mid: number, peerId: PeerId, message: Record<string, unknown> = {}): TestItem {
  return {
    bubble: document.createElement('div'),
    message: {
      _: 'message',
      mid,
      peerId,
      pFlags: {out: true},
      ...message
    }
  };
}

function addSeparators(items: TestItem[], chat: Record<string, unknown> = {}) {
  updateChatThreadSeparators(items as any, {
    hashtagType: 'my',
    isMonoforum: false,
    canManageDirectMessages: false,
    monoforumThreadId: undefined,
    isBotforum: false,
    threadId: undefined,
    isAllMessagesForum: false,
    isOutMessage: () => true,
    peerId: 1 as PeerId,
    bubbles: {},
    ...chat
  } as any);
}

function getSeparatorProps(item: TestItem) {
  return (item.bubble.chatThreadSeparator as unknown as {fedProps: Record<string, unknown>})?.fedProps;
}

beforeEach(() => {
  mocks.isForum.mockReturnValue(false);
  mocks.isBotforum.mockReturnValue(false);
  mocks.isMonoforum.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('chat thread separators', () => {
  it('groups all-messages forum bubbles by topic', () => {
    const peerId = -100 as PeerId;
    const newer = makeItem(3, peerId, {
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {forum_topic: true},
        reply_to_top_id: 20,
        reply_to_msg_id: 20
      }
    });
    const middle = makeItem(2, peerId, {
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {forum_topic: true},
        reply_to_top_id: 10,
        reply_to_msg_id: 10
      }
    });
    const older = makeItem(1, peerId, {
      reply_to: {
        _: 'messageReplyHeader',
        pFlags: {forum_topic: true},
        reply_to_top_id: 10,
        reply_to_msg_id: 10
      }
    });

    addSeparators([newer, middle, older], {
      hashtagType: undefined,
      isAllMessagesForum: true,
      peerId
    });

    expect(getSeparatorProps(older)).toMatchObject({
      peerId,
      threadId: 10,
      targetPeerId: peerId,
      targetThreadId: 10
    });
    expect(middle.bubble.chatThreadSeparator).toBeUndefined();
    expect(getSeparatorProps(newer)).toMatchObject({
      peerId,
      threadId: 20,
      targetPeerId: peerId,
      targetThreadId: 20
    });
  });

  it('does not split regular replies into topic groups in My Messages search', () => {
    const peerId = 100 as PeerId;
    const newer = makeItem(2, peerId, {
      reply_to: {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: 20}
    });
    const older = makeItem(1, peerId, {
      reply_to: {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: 10}
    });

    addSeparators([newer, older]);

    expect(older.bubble.chatThreadSeparator).toBeDefined();
    expect(newer.bubble.chatThreadSeparator).toBeUndefined();
    expect(getSeparatorProps(older)).toMatchObject({
      peerId,
      targetPeerId: peerId,
      threadId: undefined,
      targetThreadId: undefined
    });
  });

  it('passes an explicit monoforum target for My Messages results', () => {
    const peerId = -100 as PeerId;
    const monoforumThreadId = (20 as UserId).toPeerId(false);
    const item = makeItem(1, peerId, {
      saved_peer_id: {_: 'peerUser', user_id: 20}
    });
    mocks.isMonoforum.mockReturnValue(true);

    addSeparators([item]);

    expect(getSeparatorProps(item)).toMatchObject({
      peerId,
      threadId: monoforumThreadId,
      targetPeerId: peerId,
      targetMonoforumThreadId: monoforumThreadId,
      targetThreadId: undefined
    });
  });

  it('keeps Saved Messages subdialogs distinct without using ordinary reply ids', () => {
    const peerId = 100 as PeerId;
    const savedPeerId = (30 as UserId).toPeerId(false);
    const item = makeItem(1, peerId, {
      saved_peer_id: {_: 'peerUser', user_id: 30},
      reply_to: {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: 10}
    });

    addSeparators([item]);

    expect(getSeparatorProps(item)).toMatchObject({
      peerId,
      threadId: savedPeerId,
      targetPeerId: peerId,
      targetThreadId: savedPeerId
    });
  });

  it('reattaches a separator when its bubble becomes a group boundary again', () => {
    const peerId = 100 as PeerId;
    const newer = makeItem(2, peerId);
    const older = makeItem(1, peerId);
    const items = [newer, older];

    addSeparators(items);
    const separator = older.bubble.chatThreadSeparator;

    const oldest = makeItem(0, peerId);
    items.push(oldest);
    addSeparators(items);
    expect(separator?.parentElement).toBeNull();

    items.pop();
    addSeparators(items);

    expect(older.bubble.chatThreadSeparator).toBe(separator);
    expect(separator?.parentElement).toBe(older.bubble);
    expect(older.bubble.classList.contains('has-chat-thread-separator')).toBe(true);
  });
});
