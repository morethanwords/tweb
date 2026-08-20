import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  communityDialog: undefined as any,
  getMessageByPeer: vi.fn()
}));

vi.mock('@components/communities/communityAvatar', () => ({
  default: () => <span data-community-avatar="true" />
}));

vi.mock('@components/communities/communityChildBadge', () => ({
  default: () => <span />
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getChat: () => ({title: 'Community'}),
    getMessageByPeer: mocks.getMessageByPeer
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@stores/communities', () => ({
  useCommunity: () => () => ({
    _: 'community',
    id: 123,
    pFlags: {},
    title: 'Community'
  }),
  useCommunityDialog: () => () => mocks.communityDialog
}));

import {
  createCommunityDialogListElement
} from '@components/communities/communityDialog';

function createManager() {
  const destroyCallbacks: VoidFunction[] = [];
  const listEl = document.createElement('a');
  listEl.classList.add('chatlist-chat');
  const lastMessageSpan = document.createElement('span');
  const lastTimeSpan = document.createElement('span');
  const titleSpan = document.createElement('span');
  titleSpan.classList.add('peer-title');
  listEl.append(titleSpan, lastMessageSpan, lastTimeSpan);
  const dialogElement = {
    dom: {
      lastMessageSpan,
      lastTimeSpan,
      listEl
    },
    middlewareHelper: {
      onDestroy: (callback: VoidFunction) => destroyCallbacks.push(callback)
    },
    setBadgeState: vi.fn(),
    updateTitle: vi.fn((title: string) => {
      titleSpan.textContent = title;
    }),
    destroy: vi.fn()
  };
  const manager = {
    addDialogNew: vi.fn((options: {
      avatarElement: HTMLElement,
      fromName: string
    }) => {
      listEl.prepend(options.avatarElement);
      titleSpan.textContent = options.fromName;
      return dialogElement;
    }),
    setLastMessageN: vi.fn().mockResolvedValue(undefined)
  };

  return {destroyCallbacks, dialogElement, manager};
}

afterEach(() => {
  document.body.replaceChildren();
  mocks.communityDialog = undefined;
  vi.clearAllMocks();
});

describe('Community dialog projection', () => {
  it('adapts the ordinary DialogElement instead of defining a custom row', () => {
    const {dialogElement, manager} = createManager();
    const result = createCommunityDialogListElement(
      manager as any,
      123 as ChatId
    );

    expect(result).toBe(dialogElement);
    expect(manager.addDialogNew).toHaveBeenCalledWith(expect.objectContaining({
      controlled: true,
      dontSetActive: true,
      fromName: 'Community',
      isMainList: true,
      peerId: (123 as ChatId).toPeerId(true)
    }));
    expect(dialogElement.dom.listEl.tagName).toBe('A');
    expect(dialogElement.dom.listEl.dataset.communityDialog).toBe('true');
    expect(dialogElement.dom.listEl.dataset.communityId).toBe('123');
    expect(dialogElement.dom.listEl.querySelector('.peer-title')?.textContent).toBe('Community');
    expect(dialogElement.updateTitle).toHaveBeenCalledWith('Community');
    expect(customElements.get('community-dialog-list-element')).toBeUndefined();
    expect(dialogElement.dom.lastMessageSpan.textContent).toBe('Chats');
  });

  it('maps the aggregate preview and badges onto DialogElement APIs', () => {
    const childDialog = {
      _: 'dialog',
      peerId: (-10) as PeerId,
      pFlags: {},
      top_message: 7
    };
    const message = {_: 'message', mid: 7};
    mocks.communityDialog = {
      pFlags: {pinned: true},
      dialogs: [childDialog],
      lastDialogs: [childDialog],
      unreadCount: 2,
      unreadMarked: false,
      unreadMentionsCount: 2,
      unreadReactionsCount: 1,
      unreadPollVotesCount: 1,
      unreadUnmutedCount: 0
    };
    mocks.getMessageByPeer.mockReturnValue(message);
    const {dialogElement, manager} = createManager();

    createCommunityDialogListElement(manager as any, 123 as ChatId);

    expect(manager.setLastMessageN).toHaveBeenCalledWith({
      dialog: childDialog,
      dialogElement,
      lastMessage: message,
      setMessageId: false,
      subtitlePeerId: childDialog.peerId
    });
    expect(dialogElement.setBadgeState).toHaveBeenCalledWith({
      muted: false,
      pinned: true,
      unread: true,
      unreadText: '2',
      unreadMention: false,
      unreadAvatar: false,
      mentions: true,
      reactions: true,
      pollVotes: true,
      transitionDuration: 0
    });
    // every unread chat inside is muted, but the Community itself is not:
    // gray the badge out without claiming the row is muted
    expect(dialogElement.dom.listEl.classList.contains('no-unmuted-topic'))
    .toBe(true);
  });

  it('takes the muted state from the Community itself', () => {
    const childDialog = {
      _: 'dialog',
      peerId: (-10) as PeerId,
      pFlags: {},
      top_message: 7
    };
    mocks.communityDialog = {
      pFlags: {},
      dialogs: [childDialog],
      lastDialogs: [childDialog],
      muted: true,
      unreadCount: 3,
      unreadMessagesCount: 3,
      unreadMarked: false,
      unreadUnmutedCount: 3
    };
    const {dialogElement, manager} = createManager();

    createCommunityDialogListElement(manager as any, 123 as ChatId);

    expect(dialogElement.setBadgeState).toHaveBeenCalledWith(
      expect.objectContaining({muted: true, unread: true, unreadText: '3'})
    );
    // `is-muted` already grays the badge out — no need for the topic-level class
    expect(dialogElement.dom.listEl.classList.contains('no-unmuted-topic'))
    .toBe(false);
  });
});
