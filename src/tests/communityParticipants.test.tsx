import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {ChannelParticipant} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  confirmationPopup: vi.fn(),
  contextMenuOptions: undefined as any,
  getPeerTitle: vi.fn(),
  participantSelectorOptions: undefined as any,
  popupOptions: undefined as any,
  selector: undefined as any,
  tab: undefined as any,
  tabSelectorOptions: undefined as any,
  toastNew: vi.fn()
}));

vi.mock('@helpers/dom/createParticipantContextMenu', () => ({
  default: (options: any) => {
    mocks.contextMenuOptions = options;
  }
}));

vi.mock('@components/buttonTsx', () => ({
  default: {
    Corner: (props: {onClick: () => void}) => {
      const button = document.createElement('button');
      button.classList.add('btn-corner');
      button.addEventListener('click', props.onClick);
      return button;
    }
  }
}));

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/popups/pickUser', () => ({
  default: (options: any) => {
    mocks.popupOptions = options;
    return {
      selector: {
        participants: new Map()
      }
    };
  }
}));

vi.mock('@components/sidebarRight/tabs/participantsSelector', () => ({
  createSelectorForParticipants: (options: any) => {
    mocks.participantSelectorOptions = options;
    return {
      selector: mocks.selector,
      loadPromise: Promise.resolve()
    };
  },
  createSelectorForTab: (options: any) => {
    mocks.tabSelectorOptions = options;
    return {
      selector: mocks.selector,
      loadPromise: Promise.resolve()
    };
  }
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({
    collect: (promise: Promise<void>) => {
      mocks.collected = promise;
    }
  })
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@components/wrappers/getPeerTitle', () => ({
  default: mocks.getPeerTitle
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn().mockResolvedValue(document.createTextNode('Admin'))
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: (1 as UserId).toPeerId(false)
  }
}));

import RemovedUsers from '@components/sidebarRight/tabs/removedUsers';

const communityId = 10 as ChatId;
const chatId = 11 as ChatId;
const participantId = (20 as UserId).toPeerId(false);

function makeBannedParticipant(
  peerId = participantId
): ChannelParticipant.channelParticipantBanned {
  return {
    _: 'channelParticipantBanned',
    pFlags: {left: true},
    peer: {
      _: 'peerUser',
      user_id: peerId.toUserId()
    },
    kicked_by: 1 as UserId,
    date: 1,
    banned_rights: {
      _: 'chatBannedRights',
      pFlags: {view_messages: true},
      until_date: 0
    }
  };
}

function createSelector() {
  const list = document.createElement('div');
  const heightContainer = document.createElement('div');
  const scrollableContainer = document.createElement('div');
  const delimiter = document.createElement('div');
  delimiter.classList.add('gradient-delimiter');
  heightContainer.append(list);
  scrollableContainer.append(delimiter, heightContainer);
  const participants = new Map<PeerId, ChannelParticipant>();
  return {
    list,
    heightContainer,
    participants,
    scrollable: {
      container: scrollableContainer,
      append: (...elements: HTMLElement[]) => {
        scrollableContainer.append(...elements);
      }
    },
    deletePeerId: vi.fn((peerId: PeerId) => {
      list.querySelector(`[data-peer-id="${peerId}"]`)?.remove();
    }),
    getElementByKey: (peerId: PeerId) => {
      return list.querySelector(`[data-peer-id="${peerId}"]`);
    },
    renderResultsFunc: vi.fn(async(peerIds: PeerId[]) => {
      for(const peerId of peerIds) {
        const row = document.createElement('div');
        row.classList.add('row', 'chatlist-chat');
        row.dataset.peerId = '' + peerId;
        list.append(row);
      }
    })
  };
}

describe('shared RemovedUsers tab', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;
  let getParticipant: ReturnType<typeof vi.fn>;
  let getParticipantCandidates: ReturnType<typeof vi.fn>;
  let getParticipantJoinedChats: ReturnType<typeof vi.fn>;
  let getParticipants: ReturnType<typeof vi.fn>;
  let toggleParticipantBanned: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    mocks.selector = createSelector();
    mocks.collected = undefined;
    mocks.contextMenuOptions = undefined;
    mocks.participantSelectorOptions = undefined;
    mocks.popupOptions = undefined;
    mocks.tabSelectorOptions = undefined;
    mocks.confirmationPopup.mockResolvedValue(undefined);
    mocks.getPeerTitle.mockResolvedValue('Alice');

    getParticipant = vi.fn();
    getParticipantCandidates = vi.fn().mockResolvedValue({
      participantIds: [participantId],
      nextOffset: {contacts: 1, recent: 0},
      isEnd: true
    });
    getParticipantJoinedChats = vi.fn().mockResolvedValue({
      _: 'communities.participantJoinedChats',
      creator_chat_ids: [],
      joined_chat_ids: [],
      chats: [],
      users: []
    });
    getParticipants = vi.fn().mockResolvedValue({
      _: 'channels.channelParticipants',
      count: 0,
      participants: [],
      chats: [],
      users: []
    });
    toggleParticipantBanned = vi.fn().mockResolvedValue(undefined);
    mocks.tab = {
      close: vi.fn(),
      container: document.createElement('div'),
      content: document.createElement('div'),
      listenerSetter: {
        add: (element: HTMLElement) => (
          event: string,
          listener: EventListener
        ) => element.addEventListener(event, listener),
        removeManual: (element: HTMLElement) => (
          event: string,
          listener: EventListener
        ) => element.removeEventListener(event, listener)
      },
      managers: {
        appChatsManager: {
          getChat: vi.fn(),
          isBroadcast: vi.fn(),
          kickFromChat: vi.fn()
        },
        appCommunitiesManager: {
          getParticipantCandidates,
          getParticipantJoinedChats,
          hasRights: vi.fn().mockResolvedValue(true),
          toggleParticipantBanned
        },
        appProfileManager: {
          getChannelParticipant: getParticipant,
          getChannelParticipants: getParticipants
        }
      },
      middlewareHelper: {
        get: () => () => true
      },
      payload: {communityId},
      slider: {}
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  async function renderTab() {
    dispose = render(() => <RemovedUsers />, container);
    await mocks.collected;
  }

  it('uses the standard selector with server search and pagination', async() => {
    const bannedParticipant = makeBannedParticipant();
    getParticipants.mockResolvedValue({
      _: 'channels.channelParticipants',
      count: 1,
      participants: [bannedParticipant],
      chats: [],
      users: []
    });
    await renderTab();

    expect(mocks.selector.scrollable.container.children[0].classList.contains(
      'sidebar-left-section-container'
    )).toBe(true);
    expect(mocks.selector.scrollable.container.children[1])
    .toBe(mocks.selector.heightContainer);
    expect(mocks.participantSelectorOptions).toBeUndefined();
    expect(mocks.tabSelectorOptions).toMatchObject({
      channelParticipantsUpdatePeerId: communityId.toPeerId(true),
      peerType: ['custom']
    });
    expect(mocks.tabSelectorOptions.peerId).toBeUndefined();
    await expect(mocks.tabSelectorOptions.getMoreCustom(
      'alice',
      () => true
    )).resolves.toEqual({
      result: [participantId],
      isEnd: true
    });
    expect(getParticipants).toHaveBeenCalledWith({
      id: communityId,
      filter: {
        _: 'channelParticipantsKicked',
        q: 'alice'
      },
      offset: 0,
      limit: 50
    });
    expect(mocks.selector.participants.get(participantId))
    .toBe(bannedParticipant);
    expect(
      mocks.tabSelectorOptions.channelParticipantsUpdateFilter(
        bannedParticipant
      )
    ).toBe(true);
    expect(
      mocks.tabSelectorOptions.channelParticipantsUpdateFilter({
        _: 'channelParticipant',
        user_id: participantId.toUserId(),
        date: 1
      })
    ).toBe(false);
  });

  it('uses a single-select contact picker and syncs a new ban', async() => {
    const bannedParticipant = makeBannedParticipant();
    getParticipant
    .mockRejectedValueOnce({type: 'COMMUNITY_ID_INVALID'})
    .mockResolvedValueOnce(bannedParticipant);
    await renderTab();

    (mocks.tab.content as HTMLElement).querySelector<HTMLButtonElement>(
      '.btn-corner'
    ).click();
    expect(mocks.popupOptions.peerType).toEqual(['custom']);
    expect(mocks.popupOptions.multiSelect).toBeUndefined();
    await expect(mocks.popupOptions.getMoreCustom(
      'alice',
      () => true
    )).resolves.toEqual({
      result: [participantId],
      isEnd: true
    });
    expect(getParticipantCandidates).toHaveBeenCalledWith({
      communityId,
      query: 'alice',
      offset: {contacts: 0, recent: 0},
      limit: 50,
      kind: 'ban'
    });

    await mocks.popupOptions.onSelect([{peerId: participantId}]);

    expect(getParticipantJoinedChats).not.toHaveBeenCalled();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(toggleParticipantBanned).toHaveBeenCalledWith({
      communityId,
      participantId
    });
    expect(mocks.selector.participants.get(participantId))
    .toBe(bannedParticipant);
    expect(mocks.selector.renderResultsFunc).toHaveBeenCalledWith(
      [participantId],
      false
    );
  });

  it('rejects a creator or non-editable administrator before banning', async() => {
    getParticipant.mockResolvedValue({
      _: 'channelParticipantAdmin',
      pFlags: {},
      user_id: participantId.toUserId(),
      promoted_by: 2 as UserId,
      date: 1,
      admin_rights: {_: 'chatAdminRights', pFlags: {}}
    });
    await renderTab();
    (mocks.tab.content as HTMLElement).querySelector<HTMLButtonElement>(
      '.btn-corner'
    ).click();

    await mocks.popupOptions.onSelect([{peerId: participantId}]);

    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'AddBannedErrorAdmin'
    });
    expect(getParticipantJoinedChats).not.toHaveBeenCalled();
    expect(toggleParticipantBanned).not.toHaveBeenCalled();
  });

  it('unbans through the standard participant context menu adapter', async() => {
    const participant = makeBannedParticipant();
    mocks.selector.participants.set(participantId, participant);
    await mocks.selector.renderResultsFunc([participantId]);
    await renderTab();

    await mocks.contextMenuOptions.bannedParticipantAdapter.unban(
      participantId,
      participant
    );

    expect(toggleParticipantBanned).toHaveBeenCalledWith({
      communityId,
      participantId,
      unban: true
    });
    expect(mocks.selector.participants.has(participantId)).toBe(false);
    expect(mocks.selector.deletePeerId).toHaveBeenCalledWith(participantId);
  });

  it('preserves the existing chat Removed Users path', async() => {
    mocks.tab.payload = {chatId};
    mocks.tab.managers.appChatsManager.getChat.mockResolvedValue({
      _: 'channel',
      pFlags: {creator: true},
      id: chatId,
      access_hash: '1',
      title: 'Chat',
      photo: {_: 'chatPhotoEmpty'},
      date: 1
    });
    mocks.tab.managers.appChatsManager.isBroadcast.mockResolvedValue(false);
    await renderTab();

    expect(mocks.tabSelectorOptions).toBeUndefined();
    expect(mocks.participantSelectorOptions).toMatchObject({
      peerId: chatId.toPeerId(true)
    });
    expect(mocks.contextMenuOptions.bannedParticipantAdapter).toBeUndefined();
  });

  it('does not finish initialization after the Solid root is disposed', async() => {
    let resolveRights: (value: boolean) => void;
    mocks.tab.managers.appCommunitiesManager.hasRights.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRights = resolve;
      })
    );
    dispose = render(() => <RemovedUsers />, container);
    const collected = mocks.collected;

    dispose();
    dispose = undefined;
    resolveRights(true);
    await collected;

    expect(mocks.tabSelectorOptions).toBeUndefined();
    expect(mocks.tab.content.childElementCount).toBe(0);
    expect(mocks.tab.container.classList)
    .not.toContain('removed-users-container');
  });
});
