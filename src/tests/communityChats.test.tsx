import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {createStore} from 'solid-js/store';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  community: undefined as any,
  communityDialog: undefined as any,
  full: undefined as any,
  peers: {} as Record<PeerId, any>,
  setItems: vi.fn(),
  toggleAsOne: vi.fn(),
  getChatFull: vi.fn(),
  pendingRequests: undefined as any
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: any[]) => document.createTextNode(
    args ? `${key}:${args.join(',')}` : key
  )
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => mocks.peers[peerId],
    getMessageByPeer: () => ({date: 1})
  }
}));

vi.mock('@stores/communities', () => ({
  useCommunity: () => () => mocks.community,
  useCommunityDialog: () => () => mocks.communityDialog,
  useCommunityFull: () => () => mocks.full,
  useCommunityPendingRequestsCount: () => () => {
    return mocks.pendingRequests?.totalCount ??
      mocks.full?.peer_link_requests_pending ??
      0;
  },
  useCommunityPeerLinkRequests: () => () => mocks.pendingRequests
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => mocks.peers
}));

vi.mock('@components/checkboxFieldTsx', () => ({
  default: (props: any) => (
    <input
      type="checkbox"
      data-testid="show-as-one"
      data-checked={String(props.checked)}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  )
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => <label class="row">{props.children}</label>;
  Row.CheckboxFieldToggle = (props: any) => props.children;
  Row.Title = (props: any) => <span>{props.children}</span>;
  return {default: Row};
});

vi.mock('@components/communities/communityAvatar', () => ({
  default: () => <div data-testid="community-avatar" />
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: (props: any) => (
    <span class={props.class} data-icon={props.icon} />
  )
}));

vi.mock('@components/communities/communityShared', () => ({
  CommunityPendingRequestsRow: (props: any) => (
    <button data-testid="pending-requests" onClick={props.onClick}>
      {props.count}
    </button>
  )
}));

vi.mock('@components/communities/communityPeerDialogList', () => ({
  default: (props: any) => (
    <div
      data-avatar-size={props.avatarSize}
      data-community-section={
        props.items?.length && props.getClass ? '' : undefined
      }
    >
      {props.items.map((item: any) => (
        <div
          data-peer-id={props.getPeerId(item)}
          onClick={(event) => props.onClick?.(item, event)}
        >
          <span data-testid="peer-title-accessory">
            {props.getTitleAccessory?.(item)}
          </span>
          <span data-testid="peer-subtitle">
            {props.getSubtitle?.(item)}
          </span>
          <span data-testid="peer-right">{props.getRight?.(item)}</span>
        </div>
      ))}
    </div>
  )
}));

vi.mock('@components/communities/communityPendingRequest', () => ({
  CommunityPendingRequestRow: (props: any) => (
    <div data-testid="pending-request-row">
      {props.request.peer.channel_id}
    </div>
  ),
  createCommunityPendingRequestActions: () => ({
    stage: vi.fn(),
    flush: vi.fn(),
    stagedPeerIds: () => new Set()
  }),
  showCommunityRequestError: vi.fn()
}));

import CommunityChats from '@components/forumTab/communityChats';

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe('CommunityChats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toggleAsOne.mockResolvedValue(undefined);
    mocks.getChatFull.mockResolvedValue(undefined);

    const joinedId = (1 as ChatId).toPeerId(true);
    const viewableId = (2 as ChatId).toPeerId(true);
    const botId = 3 as PeerId;
    const requestableId = (4 as ChatId).toPeerId(true);
    const hiddenId = (5 as ChatId).toPeerId(true);
    mocks.community = {
      _: 'community',
      id: 123,
      pFlags: {},
      title: 'Community'
    };
    mocks.full = {
      linked_peers: [{
        _: 'communityPeer',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: 1},
        visible: true
      }, {
        _: 'communityPeer',
        pFlags: {can_view_history: true},
        peer: {_: 'peerChannel', channel_id: 2},
        visible: true
      }, {
        _: 'communityPeer',
        pFlags: {},
        peer: {_: 'peerUser', user_id: 3},
        visible: false
      }, {
        _: 'communityPeer',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: 4},
        visible: true
      }, {
        _: 'communityPeer',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: 5},
        visible: false
      }]
    };
    const [communityDialog] = createStore({
      mutedPeerIds: [joinedId],
      dialogs: [{
        _: 'dialog',
        peerId: joinedId,
        pFlags: {},
        top_message: 1,
        index_0: 10
      }]
    });
    mocks.communityDialog = communityDialog;
    mocks.peers = {
      [joinedId]: {
        _: 'channel',
        pFlags: {}
      },
      [viewableId]: {
        _: 'channel',
        pFlags: {left: true}
      },
      [botId]: {
        _: 'user',
        pFlags: {bot: true}
      },
      [requestableId]: {
        _: 'channel',
        pFlags: {left: true, megagroup: true},
        participants_count: 42
      },
      [hiddenId]: {
        _: 'channel',
        pFlags: {left: true, megagroup: true},
        participants_count: 7
      }
    };
    mocks.pendingRequests = undefined;
  });

  it('uses shared Sections and keeps Show as One Chat first', async() => {
    const botPeerId = 3 as PeerId;
    const requestablePeerId = (4 as ChatId).toPeerId(true);
    const hiddenPeerId = (5 as ChatId).toPeerId(true);
    const lists = {
      joined: document.createElement('ul'),
      viewable: document.createElement('ul')
    };
    const tab = {
      peerId: (123 as ChatId).toPeerId(true),
      headerAvatar: document.createElement('div'),
      title: document.createElement('div'),
      subtitle: document.createElement('div'),
      toggleAsOne: mocks.toggleAsOne,
      openLinkedChat: vi.fn(),
      openAddChat: vi.fn(),
      openPendingRequests: vi.fn(),
      loadPendingRequests: vi.fn().mockResolvedValue(undefined),
      managers: {
        appProfileManager: {getChatFull: mocks.getChatFull},
        appCommunitiesManager: {
          togglePeerLinkRequestApproval: vi.fn()
        }
      },
      xd: {
        getList: (kind: keyof typeof lists) => lists[kind],
        setItems: mocks.setItems
      }
    } as any;
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <CommunityChats tab={tab} />, container);

    expect(tab.headerAvatar.querySelector('[data-testid="community-avatar"]'))
    .not.toBeNull();
    expect(tab.title.textContent).toBe('Community');
    expect(tab.subtitle.textContent).toBe('Community.ChatsCount:5');
    // no wrapper element around either — it would break the header text-overflow
    expect(tab.title.children).toHaveLength(0);
    expect(tab.subtitle.children).toHaveLength(0);

    const sections = [...container.querySelectorAll(
      '.sidebar-left-section-container'
    )];
    expect(sections).toHaveLength(5);
    expect(sections[0].textContent).toContain('Community.ShowAsOne');
    expect(sections[0].textContent).toContain('Community.ShowAsOneInfo');
    expect(sections.slice(1).map((section) => {
      return section.querySelector('.sidebar-left-section-name')?.textContent;
    })).toEqual([
      'Community.ChatsJoined',
      'Community.ChatsVisible',
      'Community.ChatsRequestable',
      'Community.ChatsHidden'
    ]);
    expect(sections[1].contains(lists.joined)).toBe(true);
    expect(sections[2].contains(lists.viewable)).toBe(true);
    expect(mocks.setItems).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          peerId: (1 as ChatId).toPeerId(true),
          muted: true
        }),
        expect.objectContaining({
          peerId: botPeerId,
          kind: 'viewable'
        })
      ])
    );
    const projectedItems = mocks.setItems.mock.calls[0][0];
    expect(() => structuredClone(projectedItems[0].dialog)).not.toThrow();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector(
      `[data-peer-id="${requestablePeerId}"] [data-testid="peer-subtitle"]`
    )?.textContent).toBe('Members:42');
    expect(container.querySelector(
      `[data-peer-id="${hiddenPeerId}"] [data-testid="peer-subtitle"]`
    )?.textContent).toBe('Members:7');
    expect(container.querySelector(
      `[data-peer-id="${hiddenPeerId}"] ` +
      '[data-testid="peer-title-accessory"] [data-icon="eye2"]'
    )).not.toBeNull();
    expect(container.querySelector(
      `[data-peer-id="${hiddenPeerId}"] ` +
      '[data-testid="peer-right"] [data-icon="eye2"]'
    )).toBeNull();
    expect(container.querySelector(
      `[data-peer-id="${requestablePeerId}"] [data-icon="eye2"]`
    )).toBeNull();
    expect(container.querySelectorAll(
      '[data-avatar-size="abitbigger"]'
    )).toHaveLength(2);
    container.querySelector<HTMLElement>(
      `[data-peer-id="${requestablePeerId}"]`
    ).click();
    expect(tab.openLinkedChat).toHaveBeenCalledWith({
      peerId: requestablePeerId,
      kind: 'requestable',
      visible: true
    });
    const addChat = [...container.querySelectorAll('button')].find((button) => {
      return button.textContent.includes('Community.AddChatButton');
    });
    expect(addChat).toBeDefined();
    addChat.click();
    expect(tab.openAddChat).toHaveBeenCalledOnce();

    container.querySelector<HTMLInputElement>(
      '[data-testid="show-as-one"]'
    ).click();
    await vi.waitFor(() => {
      expect(mocks.toggleAsOne).toHaveBeenCalledWith(true);
    });
  });

  it('shows one pending request inline and more as a navigation row', () => {
    mocks.full.peer_link_requests_pending = 1;
    mocks.community.pFlags.creator = true;
    mocks.pendingRequests = {
      loaded: true,
      totalCount: 1,
      requests: [9].map((channelId) => ({
        _: 'communityPeerRequest',
        pFlags: {visible: true},
        peer: {_: 'peerChannel', channel_id: channelId},
        requested_by: 10,
        date: 1
      }))
    };
    const tab = {
      peerId: (123 as ChatId).toPeerId(true),
      headerAvatar: document.createElement('div'),
      title: document.createElement('div'),
      subtitle: document.createElement('div'),
      toggleAsOne: mocks.toggleAsOne,
      openLinkedChat: vi.fn(),
      openAddChat: vi.fn(),
      openPendingRequests: vi.fn(),
      loadPendingRequests: vi.fn().mockResolvedValue(undefined),
      managers: {
        appProfileManager: {getChatFull: mocks.getChatFull},
        appCommunitiesManager: {
          togglePeerLinkRequestApproval: vi.fn()
        }
      },
      xd: {
        getList: () => document.createElement('ul'),
        setItems: mocks.setItems
      }
    } as any;
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <CommunityChats tab={tab} />, container);

    expect(container.querySelectorAll('[data-testid="pending-request-row"]'))
    .toHaveLength(1);
    expect(container.querySelector('[data-testid="pending-requests"]'))
    .toBeNull();
    expect(tab.loadPendingRequests).not.toHaveBeenCalled();

    dispose();
    tab.loadPendingRequests.mockClear();
    mocks.pendingRequests = {
      loaded: true,
      totalCount: 3,
      requests: []
    };
    dispose = render(() => <CommunityChats tab={tab} />, container);
    const pendingRequests = container.querySelector<HTMLButtonElement>(
      '[data-testid="pending-requests"]'
    );
    expect(pendingRequests.textContent).toContain('3');
    expect(pendingRequests.querySelector('[data-icon="next"]')).toBeNull();
    pendingRequests.click();
    expect(tab.openPendingRequests).toHaveBeenCalledOnce();
    expect(tab.loadPendingRequests).not.toHaveBeenCalled();
  });

  it('replaces a failed initial load with a retry action', async() => {
    mocks.full = undefined;
    mocks.getChatFull
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined);
    const tab = {
      peerId: (123 as ChatId).toPeerId(true),
      headerAvatar: document.createElement('div'),
      title: document.createElement('div'),
      subtitle: document.createElement('div'),
      managers: {
        appProfileManager: {getChatFull: mocks.getChatFull},
        appCommunitiesManager: {
          togglePeerLinkRequestApproval: vi.fn()
        }
      },
      xd: {
        getList: () => document.createElement('ul'),
        setItems: mocks.setItems
      }
    } as any;
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <CommunityChats tab={tab} />, container);

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(tab.subtitle.textContent).toBe('Community.Title');
    const retry = [...container.querySelectorAll('button')].find((button) => {
      return button.textContent === 'Community.Retry';
    });
    expect(retry).toBeDefined();
    retry.click();
    await vi.waitFor(() => {
      expect(mocks.getChatFull).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('.preloader')).not.toBeNull();
    });
  });
});
