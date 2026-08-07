import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  bots: [] as any[],
  canManageLinkedPeers: vi.fn(),
  chats: [] as any[],
  closeTabsUntilTab: vi.fn(),
  communities: [] as any[],
  confirmationPopup: vi.fn(),
  createTab: vi.fn(),
  getBotsToAdd: vi.fn(),
  getChatsToAdd: vi.fn(),
  getPeersLimit: vi.fn(),
  getTab: vi.fn(),
  getChatFull: vi.fn(),
  getJoinedCommunities: vi.fn(),
  openTab: vi.fn(),
  peers: {} as Record<PeerId, any>,
  removeTabFromHistory: vi.fn(),
  tab: undefined as any,
  toast: vi.fn(),
  togglePeerLink: vi.fn()
}));

vi.mock('@components/buttonTsx', () => ({
  default: (props: any) => (
    <button
      type="button"
      data-testid={props.text}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  )
}));

vi.mock('@components/appSelectPeers', () => ({
  default: class {
    public container = document.createElement('div');
    public section = {
      container: document.createElement('div')
    };
    public scrollable = {
      prepend: (...nodes: Node[]) => this.container.prepend(...nodes)
    };

    constructor(options: any) {
      const input = document.createElement('input');
      input.dataset.testid = 'selector-search';
      this.container.append(input);
      options.appendTo.append(this.container);
      void options.getMoreCustom('', () => true).then(({result}: any) => {
        for(const peerId of result) {
          const button = document.createElement('button');
          button.dataset.testid = `peer-${peerId}`;
          button.addEventListener('click', () => options.onSelect(peerId));
          this.container.append(button);
        }
        options.onFirstRender?.();
      });
    }

    public checkForTriggers() {}
  }
}));

vi.mock('@components/communities/communityPeerDialogList', () => ({
  default: (props: any) => (
    <div>
      {props.items.map((item: any) => {
        const peerId = props.getPeerId(item);
        return (
          <button
            type="button"
            data-testid={`peer-${peerId}`}
            onClick={() => props.onClick?.(item)}
          />
        );
      })}
    </div>
  ),
  CommunityDialogList: (props: any) => (
    <div>
      {props.communities.map((community: any) => (
        <button
          type="button"
          data-testid={`community-${community.id}`}
          onClick={() => props.onClick(community)}
        />
      ))}
    </div>
  )
}));

vi.mock('@components/communities/communityShared', () => ({
  CommunityRadioOption: (props: any) => (
    <button
      type="button"
      data-testid={`visibility-${props.value}`}
      onClick={() => props.onSelect(props.value)}
    />
  ),
  communitySharedStyles: {
    empty: 'empty',
    primaryButton: 'primaryButton',
    root: 'root'
  }
}));

vi.mock('@components/communities/communityAvatar', () => ({
  default: () => <div data-testid="community-avatar" />
}));

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/inputSearch', () => ({
  default: class {
    public container = document.createElement('input');

    constructor(options: {onChange: (value: string) => void}) {
      this.container.addEventListener('input', () => {
        options.onChange(this.container.value);
      });
    }

    public remove() {
      this.container.remove();
    }
  }
}));

vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: any) => <div>{props.children}</div>;
  MediaHeader.Sticker = (props: any) => <div>{props.element}</div>;
  MediaHeader.Title = (props: any) => <div>{props.children}</div>;
  MediaHeader.Subtitle = (props: any) => <div>{props.children}</div>;
  return {default: MediaHeader};
});

vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => (
    <button type="button" data-testid="row" onClick={props.clickable}>
      {props.children}
    </button>
  );
  Row.Icon = () => <span />;
  Row.Title = (props: any) => <span>{props.children}</span>;
  return {default: Row};
});

vi.mock('@components/section', () => ({
  default: (props: any) => <section ref={props.ref}>{props.children}</section>
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: vi.fn()})
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppAddChatToCommunityTab: Symbol('AppAddChatToCommunityTab'),
  AppAddGroupToCommunityTab: Symbol('AppAddGroupToCommunityTab'),
  AppCommunityChatSettingsTab: Symbol('AppCommunityChatSettingsTab'),
  AppCreateCommunityTab: Symbol('AppCreateCommunityTab'),
  AppEditChatTab: Symbol('AppEditChatTab'),
  AppEditCommunityTab: Symbol('AppEditCommunityTab'),
  AppNewChannelTab: Symbol('AppNewChannelTab'),
  AppNewGroupTab: Symbol('AppNewGroupTab')
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toast
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => mocks.peers[peerId]
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@stores/communities', () => ({
  useJoinedCommunities: () => () => mocks.communities
}));

import AddChatToCommunity
from '@components/communities/addChatToCommunity';
import AddGroupToCommunity
from '@components/communities/addGroupToCommunity';
import CommunityChatSettings
from '@components/communities/communityChatSettings';
import {
  AppCommunityChatSettingsTab,
  AppCreateCommunityTab,
  AppEditChatTab,
  AppNewChannelTab,
  AppNewGroupTab
} from '@components/solidJsTabs/tabs';

const communityChatId = 30 as ChatId;
const communityPeerId = communityChatId.toPeerId(true);
const groupChatId = 40 as ChatId;
const groupPeerId = groupChatId.toPeerId(true);

describe('CommunityChatSettings', () => {
  let dispose: VoidFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmationPopup.mockResolvedValue(undefined);
    mocks.canManageLinkedPeers.mockResolvedValue(true);
    mocks.closeTabsUntilTab.mockResolvedValue(true);
    mocks.getPeersLimit.mockResolvedValue(100);
    mocks.togglePeerLink.mockResolvedValue({status: 'linked'});
    mocks.peers = {
      [groupPeerId]: {
        _: 'channel',
        id: groupChatId,
        pFlags: {}
      }
    };
    mocks.tab = createTab({
      communityId: communityChatId,
      peerId: groupPeerId,
      mode: 'add',
      initialVisibility: 'visible'
    });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  function renderSettings() {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <CommunityChatSettings />, container);
    return container;
  }

  it('saves visibility through togglePeerLink and reports a request', async() => {
    mocks.togglePeerLink.mockResolvedValue({status: 'requested'});
    const container = renderSettings();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="visibility-hidden"]'
    ).click();
    container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.AddTo"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.togglePeerLink).toHaveBeenCalledWith({
        communityId: communityChatId,
        peerId: groupPeerId,
        action: 'hidden'
      });
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Community.RequestSent'
    });
  });

  it('confirms a non-admin suggestion and reports a successful add', async() => {
    mocks.canManageLinkedPeers.mockResolvedValue(false);
    const container = renderSettings();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.AddTo"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.togglePeerLink).toHaveBeenCalledOnce();
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'Community.AddTo',
      descriptionLangKey: 'Community.AddGroupConfirm',
      button: {
        langKey: 'Add'
      }
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Community.GroupAdded'
    });
  });

  it('shows the peers limit and keeps the settings open', async() => {
    mocks.togglePeerLink.mockRejectedValue({
      type: 'COMMUNITY_PEERS_TOO_MUCH'
    });
    const container = renderSettings();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.AddTo"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.getPeersLimit).toHaveBeenCalledWith(false);
      expect(mocks.toast).toHaveBeenCalledWith({
        langPackKey: 'Community.PeersLimit',
        langPackArguments: [100]
      });
    });
    expect(mocks.tab.close).not.toHaveBeenCalled();
  });

  it('uses Save Changes in settings mode', async() => {
    const onSave = vi.fn();
    mocks.tab = createTab({
      peerId: groupPeerId,
      mode: 'settings',
      initialVisibility: 'visible',
      onSave
    });
    const container = renderSettings();

    expect(
      container.querySelector('[data-testid="Community.AddTo"]')
    ).toBeNull();
    container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.SaveChanges"]'
    ).click();

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('visible');
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
  });

  it('closes the add flow back to Edit Chat after linking', async() => {
    const editChatTab = {type: AppEditChatTab};
    mocks.getTab.mockReturnValue(editChatTab);
    mocks.tab = createTab({
      communityId: communityChatId,
      peerId: groupPeerId,
      mode: 'add',
      initialVisibility: 'visible',
      returnToEditChat: true
    });
    const container = renderSettings();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.AddTo"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.closeTabsUntilTab).toHaveBeenCalledWith(editChatTab);
    });
    expect(mocks.tab.close).not.toHaveBeenCalled();
  });
});

describe('AddGroupToCommunity', () => {
  let dispose: VoidFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getJoinedCommunities.mockResolvedValue([]);
    mocks.getChatFull.mockResolvedValue(undefined);
    mocks.communities = [{
      _: 'community',
      id: communityPeerId,
      pFlags: {},
      title: 'Existing Community'
    }];
    mocks.peers = {
      [groupPeerId]: {
        _: 'channel',
        id: groupChatId,
        pFlags: {}
      }
    };
    mocks.tab = createTab({peerId: groupPeerId});
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('routes Create Community and an existing Community correctly', () => {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <AddGroupToCommunity />, container);

    findButton(container, 'Community.Create').click();
    expect(mocks.openTab).toHaveBeenCalledWith(
      AppCreateCommunityTab,
      {peerId: groupPeerId}
    );

    container.querySelector<HTMLButtonElement>(
      `[data-testid="community-${communityPeerId}"]`
    ).click();
    expect(mocks.openTab).toHaveBeenCalledWith(
      AppCommunityChatSettingsTab,
      {
        communityId: communityChatId,
        peerId: groupPeerId,
        mode: 'add',
        initialVisibility: 'visible',
        returnToEditChat: true
      }
    );
  });
});

describe('AddChatToCommunity', () => {
  let dispose: VoidFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chats = [{
      _: 'channel',
      id: groupChatId,
      pFlags: {},
      title: 'Available group'
    }];
    mocks.bots = [];
    mocks.getChatsToAdd.mockResolvedValue(mocks.chats);
    mocks.getBotsToAdd.mockResolvedValue(mocks.bots);
    mocks.tab = createTab({communityId: communityChatId});
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('renders the selector before chat candidates finish loading', () => {
    const pending = new Promise<never>(() => {});
    mocks.getChatsToAdd.mockReturnValue(pending);
    mocks.getBotsToAdd.mockReturnValue(pending);
    const container = document.createElement('div');
    document.body.append(container);
    container.append(mocks.tab.content);

    dispose = render(() => <AddChatToCommunity />, container);

    expect(container.querySelector('[data-testid="selector-search"]'))
    .not.toBeNull();
    expect(mocks.tab.title.childElementCount).toBe(0);
  });

  it('uses an in-content selector and routes chats to settings', async() => {
    const container = document.createElement('div');
    document.body.append(container);
    container.append(mocks.tab.content);
    dispose = render(() => <AddChatToCommunity />, container);

    await vi.waitFor(() => {
      expect(
        container.querySelector(`[data-testid="peer-${groupPeerId}"]`)
      ).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="selector-search"]'))
    .not.toBeNull();
    expect(mocks.tab.title.childElementCount).toBe(0);
    container.querySelector<HTMLButtonElement>(
      `[data-testid="peer-${groupPeerId}"]`
    ).click();
    expect(mocks.openTab).toHaveBeenCalledWith(
      AppCommunityChatSettingsTab,
      {
        communityId: communityChatId,
        peerId: groupPeerId,
        mode: 'add',
        initialVisibility: 'visible',
        returnToEditCommunity: true
      }
    );

    findButton(container, 'NewGroup').click();
    const createGroupPayload = mocks.openTab.mock.calls.find(
      ([tabType]) => tabType === AppNewGroupTab
    )[1];
    await createGroupPayload.onCreate(50 as ChatId);
    expect(mocks.openTab).toHaveBeenCalledWith(
      AppCommunityChatSettingsTab,
      {
        communityId: communityChatId,
        peerId: (50 as ChatId).toPeerId(true),
        mode: 'add',
        initialVisibility: 'visible',
        returnToEditCommunity: true
      }
    );
    expect(mocks.removeTabFromHistory).toHaveBeenCalledWith(mocks.tab);
  });

  it.each([
    ['NewGroup', AppNewGroupTab],
    ['NewChannel', AppNewChannelTab]
  ])('keeps Add Chat open until the created chat settings tab opens via %s', async(
    actionText,
    createTabType
  ) => {
    let resolveSettings!: VoidFunction;
    const settingsOpened = new Promise<void>((resolve) => {
      resolveSettings = resolve;
    });
    mocks.openTab.mockImplementation((tabType) => {
      if(tabType === AppCommunityChatSettingsTab) {
        return settingsOpened;
      }
    });
    const container = document.createElement('div');
    document.body.append(container);
    container.append(mocks.tab.content);
    dispose = render(() => <AddChatToCommunity />, container);

    findButton(container, actionText).click();
    const createGroupPayload = mocks.openTab.mock.calls.find(
      ([tabType]) => tabType === createTabType
    )[1];
    const onCreatePromise = createGroupPayload.onCreate(50 as ChatId);

    expect(mocks.removeTabFromHistory).not.toHaveBeenCalled();
    resolveSettings();
    await onCreatePromise;
    expect(mocks.removeTabFromHistory).toHaveBeenCalledWith(mocks.tab);
  });
});

function createTab(payload: any) {
  const content = document.createElement('div');
  const scrollableContainer = document.createElement('div');
  const title = document.createElement('div');
  document.body.append(title);
  mocks.createTab.mockImplementation((tabType) => ({
    open: (openPayload: any) => mocks.openTab(tabType, openPayload)
  }));
  return {
    close: vi.fn(),
    content,
    managers: {
      appProfileManager: {
        getChatFull: mocks.getChatFull
      },
      appCommunitiesManager: {
        canManageLinkedPeers: mocks.canManageLinkedPeers,
        getBotsToAdd: mocks.getBotsToAdd,
        getChatsToAdd: mocks.getChatsToAdd,
        getPeersLimit: mocks.getPeersLimit,
        getJoinedCommunities: mocks.getJoinedCommunities,
        togglePeerLink: mocks.togglePeerLink
      }
    },
    middlewareHelper: {
      get: () => ({})
    },
    payload,
    slider: {
      closeTabsUntilTab: mocks.closeTabsUntilTab,
      createTab: mocks.createTab,
      getTab: mocks.getTab,
      removeTabFromHistory: mocks.removeTabFromHistory
    },
    scrollable: {
      container: scrollableContainer
    },
    title
  };
}

function findButton(container: HTMLElement, text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
  .find((button) => button.textContent === text);
}
