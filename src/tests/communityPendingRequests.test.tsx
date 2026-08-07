import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {CommunityPeerRequest} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  actionOptions: undefined as any,
  actions: undefined as any,
  community: undefined as any,
  confirmationPopup: vi.fn(),
  closeTabsUntilTab: vi.fn(),
  getTab: vi.fn(),
  openEditTab: vi.fn(),
  showCommunityRequestError: vi.fn(),
  state: undefined as any,
  tab: undefined as any,
  toastNew: vi.fn()
}));

vi.mock('@components/buttonTsx', () => {
  const Button = (props: any) => (
    <button
      class={props.class}
      data-testid={props.text}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  );
  return {default: Button};
});

vi.mock('@components/communities/communityPendingRequest', () => ({
  CommunityPendingRequestRow: (props: any) => (
    <div data-testid="request-row">
      <button
        data-testid="stage-add"
        onClick={() => props.onApply(props.request, false)}
      />
      <button
        data-testid="stage-decline"
        onClick={() => props.onApply(props.request, true)}
      />
    </div>
  ),
  showCommunityRequestError: mocks.showCommunityRequestError
}));

vi.mock('@components/communities/communityPendingRequestActions', () => ({
  default: vi.fn((options) => {
    mocks.actionOptions = options;
    return mocks.actions;
  })
}));

vi.mock('@components/communities/communityShared', () => ({
  communitySharedStyles: {root: 'root'}
}));

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/section', () => ({
  default: (props: any) => (
    <section>
      {props.captionTop && (
        <div data-testid="section-caption">{props.caption}</div>
      )}
      <div data-testid="section-content">{props.children}</div>
      {!props.captionTop && props.caption && (
        <div data-testid="section-caption">{props.caption}</div>
      )}
    </section>
  )
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: vi.fn()})
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppCommunityPendingRequestsTab: class {},
  AppEditCommunityTab: class {}
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@stores/communities', () => ({
  useCommunity: () => () => mocks.community,
  useCommunityPeerLinkRequests: () => () => mocks.state
}));

import CommunityPendingRequests
from '@components/communities/communityPendingRequests';

const communityId = 10 as ChatId;

function makeRequest(channelId: ChatId): CommunityPeerRequest {
  return {
    _: 'communityPeerRequest',
    pFlags: {visible: true},
    peer: {_: 'peerChannel', channel_id: channelId},
    requested_by: 1,
    date: 1
  };
}

describe('CommunityPendingRequests', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;
  let toggleAllPeerLinkRequestApproval: ReturnType<typeof vi.fn>;
  let togglePeerLinkRequestApproval: ReturnType<typeof vi.fn>;
  const requests = [
    makeRequest(20 as ChatId),
    makeRequest(21 as ChatId)
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    const tabContent = document.createElement('div');
    const tabScrollable = document.createElement('div');
    tabContent.append(tabScrollable);
    document.body.append(tabContent);
    toggleAllPeerLinkRequestApproval = vi.fn().mockResolvedValue(undefined);
    togglePeerLinkRequestApproval = vi.fn().mockResolvedValue(undefined);
    mocks.actions = {
      flush: vi.fn().mockResolvedValue(undefined),
      stage: vi.fn(),
      stagedPeerIds: () => new Set<PeerId>()
    };
    mocks.community = {
      _: 'community',
      id: communityId,
      pFlags: {creator: true},
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 1
    };
    mocks.state = {
      loaded: true,
      totalCount: requests.length,
      requests
    };
    mocks.tab = {
      close: vi.fn(),
      managers: {
        appCommunitiesManager: {
          getPeerLinkRequests: vi.fn().mockResolvedValue(undefined),
          toggleAllPeerLinkRequestApproval,
          togglePeerLinkRequestApproval
        }
      },
      middlewareHelper: {
        get: () => ({})
      },
      payload: {communityId},
      content: tabContent,
      scrollable: {
        container: tabScrollable
      },
      slider: {
        closeTabsUntilTab: mocks.closeTabsUntilTab,
        createTab: vi.fn(() => ({open: mocks.openEditTab})),
        getTab: mocks.getTab
      }
    };
    mocks.actionOptions = undefined;
    mocks.confirmationPopup.mockReset().mockResolvedValue(undefined);
    mocks.closeTabsUntilTab.mockReset().mockResolvedValue(true);
    mocks.getTab.mockReset().mockReturnValue(undefined);
    mocks.openEditTab.mockReset().mockResolvedValue(undefined);
    mocks.showCommunityRequestError.mockReset().mockResolvedValue(undefined);
    mocks.toastNew.mockReset();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('flushes staged undo actions before approving all requests', async() => {
    const order: string[] = [];
    mocks.actions.flush.mockImplementation(async() => {
      order.push('flush');
    });
    toggleAllPeerLinkRequestApproval.mockImplementation(async() => {
      order.push('approve-all');
    });
    dispose = render(() => <CommunityPendingRequests />, container);

    document.querySelector<HTMLButtonElement>(
      '[data-testid="Community.AddAll"]'
    ).click();

    await vi.waitFor(() => {
      expect(toggleAllPeerLinkRequestApproval).toHaveBeenCalledOnce();
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'Community.AddAllRequests',
      descriptionLangKey: 'Community.AddAllRequestsConfirm',
      descriptionLangArgs: [2],
      button: {
        langKey: 'Add',
        isDanger: false
      }
    });
    expect(order).toEqual(['flush', 'approve-all']);
    expect(toggleAllPeerLinkRequestApproval)
    .toHaveBeenCalledWith(communityId, false);
    expect(mocks.tab.close).toHaveBeenCalledOnce();
    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'Community.RequestsAdded',
      langPackArguments: [2]
    });
  });

  it('routes a failed bulk decline through the shared request error', async() => {
    const error = {type: 'CHAT_ADMIN_REQUIRED'} as ApiError;
    toggleAllPeerLinkRequestApproval.mockRejectedValue(error);
    dispose = render(() => <CommunityPendingRequests />, container);

    document.querySelector<HTMLButtonElement>(
      '[data-testid="Community.DeclineAll"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.showCommunityRequestError).toHaveBeenCalledOnce();
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'Community.DeclineAllRequests',
      descriptionLangKey: 'Community.DeclineAllRequestsConfirm',
      descriptionLangArgs: [2],
      button: {
        langKey: 'Decline',
        isDanger: true
      }
    });
    expect(mocks.actions.flush).toHaveBeenCalledOnce();
    expect(toggleAllPeerLinkRequestApproval)
    .toHaveBeenCalledWith(communityId, true);
    expect(mocks.showCommunityRequestError).toHaveBeenCalledWith({
      error,
      managers: mocks.tab.managers
    });
    expect(mocks.tab.close).not.toHaveBeenCalled();
  });

  it('wires row actions into the staged undo pipeline with peer errors', async() => {
    dispose = render(() => <CommunityPendingRequests />, container);
    const firstRequest = requests[0];

    container.querySelector<HTMLButtonElement>(
      '[data-testid="stage-decline"]'
    ).click();

    expect(mocks.actions.stage).toHaveBeenCalledWith(firstRequest, true);

    await mocks.actionOptions.apply(firstRequest, false);
    expect(togglePeerLinkRequestApproval).toHaveBeenCalledWith({
      communityId,
      peerId: (20 as ChatId).toPeerId(true),
      reject: false
    });

    const error = {type: 'COMMUNITY_PEERS_TOO_MUCH'} as ApiError;
    await mocks.actionOptions.onError(error, firstRequest);
    expect(mocks.showCommunityRequestError).toHaveBeenCalledWith({
      error,
      managers: mocks.tab.managers,
      peerId: (20 as ChatId).toPeerId(true)
    });
  });

  it('keeps Decline All before Add All even for one remaining request', () => {
    mocks.state = {
      loaded: true,
      totalCount: 1,
      requests: [requests[0]]
    };
    dispose = render(() => <CommunityPendingRequests />, container);

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => [
      'Community.DeclineAll',
      'Community.AddAll'
    ].includes(button.dataset.testid));
    expect(buttons.map((button) => button.dataset.testid)).toEqual([
      'Community.DeclineAll',
      'Community.AddAll'
    ]);
  });

  it('renders the caption above requests and pins styled bulk actions to the tab', () => {
    mocks.community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {manage_linked_peers: true},
      until_date: 0
    };
    dispose = render(() => <CommunityPendingRequests />, container);

    const caption = container.querySelector('[data-testid="section-caption"]');
    const firstRequest = container.querySelector('[data-testid="request-row"]');
    expect(caption.compareDocumentPosition(firstRequest) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();

    const decline = document.querySelector<HTMLButtonElement>(
      '[data-testid="Community.DeclineAll"]'
    );
    expect(mocks.tab.content.contains(decline)).toBe(true);
    expect(decline.classList).toContain('text-bold');
  });

  it('returns to the existing Edit Community tab from Change Settings', () => {
    const existingTab = {payload: {communityId}};
    mocks.community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {manage_linked_peers: true},
      until_date: 0
    };
    mocks.getTab.mockReturnValue(existingTab);
    dispose = render(() => <CommunityPendingRequests />, container);

    [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Community.ChangeSettings')
    .click();

    expect(mocks.closeTabsUntilTab).toHaveBeenCalledWith(existingTab);
    expect(mocks.tab.slider.createTab).not.toHaveBeenCalled();
  });

  it('opens Edit Community immediately when it is not in the tab stack', () => {
    mocks.community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {manage_linked_peers: true},
      until_date: 0
    };
    dispose = render(() => <CommunityPendingRequests />, container);

    [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Community.ChangeSettings')
    .click();

    expect(mocks.tab.slider.createTab).toHaveBeenCalledOnce();
    expect(mocks.openEditTab).toHaveBeenCalledWith({communityId});
  });
});
