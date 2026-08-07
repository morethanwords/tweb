import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  avatarCallback: undefined as ((payload: any) => void) | undefined,
  avatarClear: vi.fn(),
  chatAdministratorsTab: Symbol('AppChatAdministratorsTab'),
  community: undefined as any,
  communityFull: undefined as any,
  pendingRequestsCount: 0,
  confirmationPopup: vi.fn(),
  collectPromise: vi.fn(),
  deleteCommunity: vi.fn(),
  editDefaultBannedRightsMode: vi.fn(),
  editPhoto: vi.fn(),
  editTitle: vi.fn(),
  getPeerTitle: vi.fn(),
  joinChannel: vi.fn(),
  openJoinChatWebView: vi.fn(),
  openPeer: vi.fn(),
  openTab: vi.fn(),
  openPendingRequests: vi.fn(),
  peer: undefined as any,
  removedUsersTab: Symbol('AppRemovedUsersTab'),
  reloadCommunity: vi.fn(),
  tab: undefined as any,
  toast: vi.fn(),
  toastPlain: vi.fn(),
  togglePeerLink: vi.fn()
}));

vi.mock('@components/avatarEdit', () => ({
  default: class {
    public container = document.createElement('div');

    constructor(callback: (payload: any) => void) {
      mocks.avatarCallback = callback;
    }

    public clear() {
      mocks.avatarClear();
    }
  }
}));

vi.mock('@components/badge', () => ({
  default: (props: any) => <span>{props.children}</span>
}));

vi.mock('@components/buttonTsx', () => {
  const Button = (props: any) => (
    <button
      type="button"
      class={props.class}
      data-testid={props.text}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  );
  Button.Corner = (props: any) => (
    <button
      type="button"
      data-testid="save"
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
  return {default: Button};
});

vi.mock('@components/communities/communityAvatar', () => ({
  default: () => <div />,
  CommunityAvatarEditor: () => <div data-testid="avatar-editor" />
}));

vi.mock('@components/communities/communityPeerDialogList', () => ({
  default: (props: any) => {
    const item = () => props.items[0];
    return (
      <div data-avatar-size={props.avatarSize}>
        {props.getTitleAccessory?.(item())}
        <button
          type="button"
          data-testid="linked-open"
          onClick={() => props.onClick?.(item())}
        />
        <button
          type="button"
          data-testid="linked-remove"
          onClick={() => {
            props.getContextMenu?.(item())?.buttons[0].onClick();
          }}
        />
      </div>
    );
  }
}));

vi.mock('@components/communities/communityShared', () => ({
  CommunityManagementRow: (props: any) => (
    <button
      type="button"
      data-testid={props.title}
      onClick={props.onClick}
    >
      {props.right}
    </button>
  ),
  CommunityPendingRequestsRow: (props: any) => (
    <button
      type="button"
      data-testid="pending-requests"
      onClick={props.onClick}
    >
      {props.count}
    </button>
  ),
  CommunityRadioOption: (props: any) => (
    <button
      type="button"
      data-testid={`mode-${props.value}`}
      onClick={() => props.onSelect(props.value)}
    />
  ),
  communitySharedStyles: {
    editorFields: 'editorFields',
    editorHero: 'editorHero',
    footerAction: 'footerAction',
    hero: 'hero',
    hiddenPeerIcon: 'hiddenPeerIcon',
    root: 'root',
    saveCorner: 'saveCorner'
  }
}));

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: vi.fn()
}));

vi.mock('@components/communities/openCommunityPendingRequests', () => ({
  default: mocks.openPendingRequests
}));

vi.mock('@components/popups/channelsTooMuch', () => ({
  handleChannelsTooMuch: (callback: () => unknown) => callback()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: (props: {class?: string}) => <span class={props.class} />
}));

vi.mock('@components/inputFieldTsx', () => ({
  InputFieldTsx: (props: any) => (
    <input
      name={props.name}
      maxLength={props.maxLength}
      value={props.value}
      disabled={props.disabled}
      onInput={(event) => props.onRawInput(event.currentTarget.value)}
    />
  )
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => (
    <button type="button" onClick={props.clickable}>
      {props.children}
    </button>
  );
  Row.Icon = () => <span />;
  Row.Title = (props: any) => <span>{props.children}</span>;
  return {default: Row};
});

vi.mock('@components/section', () => ({
  default: (props: any) => <section>{props.children}</section>
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({collect: mocks.collectPromise})
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppAddChatToCommunityTab: Symbol('AppAddChatToCommunityTab'),
  AppChatAdministratorsTab: mocks.chatAdministratorsTab,
  AppCommunityPendingRequestsTab: Symbol('AppCommunityPendingRequestsTab'),
  AppEditCommunityTab: Symbol('AppEditCommunityTab'),
  AppRemovedUsersTab: mocks.removedUsersTab
}));

vi.mock('@components/toast', () => ({
  toast: mocks.toastPlain,
  toastNew: mocks.toast
}));

vi.mock('@components/wrappers/getPeerTitle', () => ({
  default: mocks.getPeerTitle
}));

vi.mock('@lib/appImManager', () => ({
  default: {
    openJoinChatWebView: mocks.openJoinChatWebView,
    setInnerPeer: mocks.openPeer
  }
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: () => mocks.peer
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@stores/communities', () => ({
  useCommunity: () => () => mocks.community,
  useCommunityFull: () => () => mocks.communityFull,
  useCommunityPendingRequestsCount: () => () => mocks.pendingRequestsCount
}));

import EditCommunity from '@components/communities/editCommunity';

const communityId = 10 as ChatId;
const linkedChatId = 20 as ChatId;
const linkedPeerId = linkedChatId.toPeerId(true);

describe('EditCommunity', () => {
  let dispose: VoidFunction;
  let tabContent: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.avatarCallback = undefined;
    mocks.pendingRequestsCount = 0;
    mocks.confirmationPopup.mockResolvedValue(undefined);
    mocks.deleteCommunity.mockResolvedValue(undefined);
    mocks.editDefaultBannedRightsMode.mockResolvedValue(undefined);
    mocks.editPhoto.mockResolvedValue(undefined);
    mocks.editTitle.mockResolvedValue(undefined);
    mocks.getPeerTitle.mockResolvedValue('Linked chat');
    mocks.joinChannel.mockResolvedValue(undefined);
    mocks.openTab.mockReset();
    mocks.reloadCommunity.mockResolvedValue(undefined);
    mocks.togglePeerLink.mockResolvedValue({status: 'deleted'});
    mocks.peer = {
      _: 'channel',
      id: linkedChatId,
      pFlags: {megagroup: true},
      title: 'Linked chat'
    };
    mocks.community = {
      _: 'community',
      id: communityId,
      pFlags: {creator: true},
      title: 'Old title',
      default_banned_rights: {
        _: 'chatBannedRights',
        pFlags: {},
        until_date: 2147483647
      }
    };
    mocks.communityFull = {
      _: 'communityFull',
      pFlags: {},
      id: communityId,
      about: '',
      admins_count: 1,
      kicked_count: 0,
      linked_peers: [{
        _: 'communityLinkedPeer',
        pFlags: {},
        peer: {_: 'peerChannel', channel_id: linkedChatId},
        visible: true
      }]
    };
    tabContent = document.createElement('div');
    document.body.append(tabContent);
    mocks.tab = {
      close: vi.fn(),
      content: tabContent,
      managers: {
        appChatsManager: {
          delete: mocks.deleteCommunity,
          editPhoto: mocks.editPhoto,
          editTitle: mocks.editTitle,
          joinChannel: mocks.joinChannel
        },
        appCommunitiesManager: {
          editDefaultBannedRightsMode: mocks.editDefaultBannedRightsMode,
          reloadCommunity: mocks.reloadCommunity,
          togglePeerLink: mocks.togglePeerLink
        }
      },
      middlewareHelper: {
        get: () => ({})
      },
      payload: {communityId},
      slider: {
        createTab: vi.fn(() => ({open: mocks.openTab}))
      }
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  function renderEditCommunity() {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <EditCommunity />, container);
    return container;
  }

  it('saves title, mode and the complete photo-video avatar payload', async() => {
    const container = renderEditCommunity();
    const photo = new File(['photo'], 'photo.jpg', {type: 'image/jpeg'});
    const video = new File(['video'], 'video.mp4', {type: 'video/mp4'});
    const input = container.querySelector<HTMLInputElement>(
      'input[name="community-name"]'
    );

    input.value = '  New title  ';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));
    container.querySelector<HTMLButtonElement>('[data-testid="mode-admins"]')
    .click();
    mocks.avatarCallback({
      file: vi.fn().mockResolvedValue(photo),
      video: vi.fn().mockResolvedValue(video),
      videoStartTs: 2.5
    });
    tabContent.querySelector<HTMLButtonElement>('[data-testid="save"]').click();

    await vi.waitFor(() => {
      expect(mocks.editPhoto).toHaveBeenCalledOnce();
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(mocks.editTitle).toHaveBeenCalledWith(communityId, 'New title');
    expect(mocks.editDefaultBannedRightsMode).toHaveBeenCalledWith(
      communityId,
      'admins'
    );
    expect(mocks.editPhoto).toHaveBeenCalledWith(communityId, {
      file: photo,
      video,
      videoStartTs: 2.5
    });
  });

  it('opens from cached community data without blocking on a reload', () => {
    renderEditCommunity();

    expect(mocks.reloadCommunity).not.toHaveBeenCalled();
    expect(mocks.collectPromise).not.toHaveBeenCalled();
  });

  it('uses the shared Pending Requests row from the community tab', () => {
    mocks.communityFull.peer_link_requests_pending = 2;
    mocks.pendingRequestsCount = 3;
    const container = renderEditCommunity();
    const pendingRequests = container.querySelector<HTMLButtonElement>(
      '[data-testid="pending-requests"]'
    );

    expect(pendingRequests.textContent).toBe('3');
    pendingRequests.click();
    expect(mocks.openPendingRequests).toHaveBeenCalledWith({
      slider: mocks.tab.slider,
      communityId
    });
  });

  it('opens the shared chat administrators tab for a community', () => {
    const container = renderEditCommunity();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="PeerInfo.Administrators"]'
    ).click();

    expect(mocks.tab.slider.createTab).toHaveBeenCalledWith(
      mocks.chatAdministratorsTab
    );
    expect(mocks.openTab).toHaveBeenCalledWith({communityId});
  });

  it('opens the shared chat Removed Users tab for a community', () => {
    const container = renderEditCommunity();

    container.querySelector<HTMLButtonElement>(
      '[data-testid="ChannelBlockedUsers"]'
    ).click();

    expect(mocks.tab.slider.createTab).toHaveBeenCalledWith(
      mocks.removedUsersTab
    );
    expect(mocks.openTab).toHaveBeenCalledWith({communityId});
  });

  it('waits for community data only when it is missing', () => {
    mocks.communityFull = undefined;
    const reloadPromise = Promise.resolve();
    mocks.reloadCommunity.mockReturnValue(reloadPromise);

    renderEditCommunity();

    expect(mocks.reloadCommunity).toHaveBeenCalledWith(communityId, false);
    expect(mocks.collectPromise).toHaveBeenCalledWith(reloadPromise);
  });

  it('confirms and executes the danger Delete Community action', async() => {
    const container = renderEditCommunity();
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="Community.Delete"]'
    );

    expect(button.classList.contains('danger')).toBe(true);
    button.click();

    await vi.waitFor(() => {
      expect(mocks.deleteCommunity).toHaveBeenCalledWith(communityId);
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'Community.Delete',
      descriptionLangKey: 'Community.DeleteConfirm',
      button: {
        langKey: 'Delete',
        isDanger: true
      }
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Community.Deleted'
    });
  });

  it('opens a linked chat and removes it through a danger confirmation', async() => {
    mocks.communityFull.linked_peers[0].visible = false;
    const container = renderEditCommunity();

    expect(container.querySelector('[data-avatar-size]')?.getAttribute(
      'data-avatar-size'
    )).toBe('abitbigger');
    expect(container.querySelector('.hiddenPeerIcon')?.classList.contains(
      'inline-icon'
    )).toBe(true);
    expect(container.querySelector('.hiddenPeerIcon')?.classList.contains(
      'inline-icon-right'
    )).toBe(true);

    container.querySelector<HTMLButtonElement>('[data-testid="linked-open"]')
    .click();
    expect(mocks.openPeer).toHaveBeenCalledWith({peerId: linkedPeerId});

    container.querySelector<HTMLButtonElement>('[data-testid="linked-remove"]')
    .click();
    await vi.waitFor(() => {
      expect(mocks.togglePeerLink).toHaveBeenCalledWith({
        communityId,
        peerId: linkedPeerId,
        action: 'deleted'
      });
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'Community.RemoveChat',
      descriptionLangKey: 'Community.RemoveChatConfirm',
      descriptionLangArgs: ['Linked chat'],
      button: {
        langKey: 'Remove',
        isDanger: true
      }
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Community.ChatRemoved'
    });
  });

  it('requests to join a requestable chat instead of opening it', async() => {
    mocks.peer.pFlags.left = true;
    mocks.communityFull.linked_peers[0].visible = true;
    const container = renderEditCommunity();

    container.querySelector<HTMLButtonElement>('[data-testid="linked-open"]')
    .click();

    await vi.waitFor(() => {
      expect(mocks.joinChannel).toHaveBeenCalledWith(linkedChatId);
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      descriptionLangKey: 'Community.RequestJoinConfirm',
      descriptionLangArgs: ['Linked chat'],
      button: {
        langKey: 'RequestJoin.Button'
      }
    });
    expect(mocks.openPeer).not.toHaveBeenCalled();
  });
});
