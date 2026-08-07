import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';

const mocks = vi.hoisted(() => ({
  tab: undefined as any,
  createCommunity: vi.fn(),
  editDefaultBannedRightsMode: vi.fn(),
  editPhoto: vi.fn(),
  editTitle: vi.fn(),
  togglePeerLink: vi.fn(),
  createTab: vi.fn(),
  getTab: vi.fn(),
  sliceTabsUntilTab: vi.fn(),
  openEdit: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@components/avatarEdit', () => ({
  default: class {
    public container = document.createElement('div');

    constructor() {
      this.container.append(document.createElement('canvas'));
    }

    public clear() {}
  }
}));

vi.mock('@components/buttonTsx', () => ({
  default: (props: any) => (
    <button
      type="button"
      data-testid="create"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  )
}));

vi.mock('@components/inputFieldTsx', () => ({
  InputFieldTsx: (props: any) => (
    <input
      name={props.name}
      maxLength={props.maxLength}
      value={props.value}
      onInput={(event) => props.onRawInput(event.currentTarget.value)}
    />
  )
}));

vi.mock('@components/section', () => ({
  default: (props: any) => <section>{props.children}</section>
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toast
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppCommunityChatSettingsTab: Symbol('AppCommunityChatSettingsTab'),
  AppCreateCommunityTab: Symbol('AppCreateCommunityTab'),
  AppEditChatTab: Symbol('AppEditChatTab'),
  AppEditCommunityTab: Symbol('AppEditCommunityTab')
}));

vi.mock('@components/communities/communityAvatar', () => ({
  default: () => <div />,
  CommunityAvatarEditor: () => <div />
}));

vi.mock('@components/communities/communityShared', () => ({
  CommunityRadioOption: (props: any) => (
    <button type="button" onClick={() => props.onSelect(props.value)}>
      {props.value}
    </button>
  ),
  communitySharedStyles: {
    root: 'root',
    hero: 'hero',
    editorFields: 'editorFields',
    primaryButton: 'primaryButton'
  }
}));

vi.mock('@components/communities/communityPeerDialogList', () => ({
  default: (props: any) => (
    <button
      type="button"
      data-testid="source-chat"
      onClick={(event) => props.onClick?.(props.items[0], event)}
    />
  )
}));

import CreateCommunity from '@components/communities/createCommunity';

describe('CreateCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCommunity.mockResolvedValue(123 as ChatId);
    mocks.editDefaultBannedRightsMode.mockResolvedValue(undefined);
    mocks.editPhoto.mockResolvedValue(undefined);
    mocks.editTitle.mockResolvedValue(undefined);
    mocks.togglePeerLink.mockResolvedValue({status: 'linked'});
    mocks.openEdit.mockResolvedValue(undefined);
    mocks.createTab.mockReturnValue({open: mocks.openEdit});
    const middlewareHelper = getMiddleware();
    mocks.tab = {
      payload: {
        peerId: (456 as ChatId).toPeerId(true)
      },
      managers: {
        appCommunitiesManager: {
          createCommunity: mocks.createCommunity,
          editDefaultBannedRightsMode: mocks.editDefaultBannedRightsMode,
          editPhoto: mocks.editPhoto,
          editTitle: mocks.editTitle,
          togglePeerLink: mocks.togglePeerLink
        }
      },
      slider: {
        createTab: mocks.createTab,
        getTab: mocks.getTab,
        sliceTabsUntilTab: mocks.sliceTabsUntilTab
      },
      middlewareHelper
    };
  });

  it('opens Edit Community after an ordinary first create', async() => {
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <CreateCommunity />, container);
    const input = container.querySelector<HTMLInputElement>(
      'input[name="community-name"]'
    );
    expect(input.maxLength).toBe(128);
    input.value = 'New Community';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));
    container.querySelector<HTMLButtonElement>('[data-testid="create"]').click();

    await vi.waitFor(() => {
      expect(mocks.openEdit).toHaveBeenCalledWith({communityId: 123});
    });

    expect(mocks.createCommunity).toHaveBeenCalledOnce();
    expect(mocks.createCommunity).toHaveBeenCalledWith({
      title: 'New Community',
      peerId: (456 as ChatId).toPeerId(true),
      hidden: false
    });
    expect(mocks.editDefaultBannedRightsMode).toHaveBeenCalledWith(123, 'all');
    expect(mocks.editTitle).not.toHaveBeenCalled();
    expect(mocks.togglePeerLink).not.toHaveBeenCalled();
    expect(mocks.editPhoto).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(mocks.createTab).toHaveBeenCalledOnce();

    dispose();
    container.remove();
  });

  it('does not continue into edits or navigation after the source tab is destroyed', async() => {
    let resolveCreate: (communityId: ChatId) => void;
    mocks.createCommunity.mockReturnValue(new Promise<ChatId>((resolve) => {
      resolveCreate = resolve;
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <CreateCommunity />, container);
    const input = container.querySelector<HTMLInputElement>(
      'input[name="community-name"]'
    );
    input.value = 'Created in flight';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));
    container.querySelector<HTMLButtonElement>('[data-testid="create"]').click();
    await vi.waitFor(() => {
      expect(mocks.createCommunity).toHaveBeenCalledOnce();
    });

    mocks.tab.middlewareHelper.destroy();
    resolveCreate(123 as ChatId);
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.editDefaultBannedRightsMode).not.toHaveBeenCalled();
    expect(mocks.editPhoto).not.toHaveBeenCalled();
    expect(mocks.editTitle).not.toHaveBeenCalled();
    expect(mocks.togglePeerLink).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.createTab).not.toHaveBeenCalled();
    expect(mocks.openEdit).not.toHaveBeenCalled();

    dispose();
    container.remove();
  });

  it('finishes creation when changing source visibility creates a request', async() => {
    let resolveCreate: (communityId: ChatId) => void;
    mocks.createCommunity.mockReturnValue(new Promise<ChatId>((resolve) => {
      resolveCreate = resolve;
    }));
    mocks.togglePeerLink.mockResolvedValue({status: 'requested'});
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => <CreateCommunity />, container);
    const input = container.querySelector<HTMLInputElement>(
      'input[name="community-name"]'
    );
    input.value = 'Requested Community';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));
    container.querySelector<HTMLButtonElement>('[data-testid="create"]').click();
    await vi.waitFor(() => {
      expect(mocks.createCommunity).toHaveBeenCalledOnce();
    });

    container.querySelector<HTMLButtonElement>('[data-testid="source-chat"]')
    .click();
    const visibilityPayload = mocks.openEdit.mock.calls[0][0];
    visibilityPayload.onSave('hidden');
    mocks.openEdit.mockClear();
    mocks.createTab.mockClear();
    resolveCreate(123 as ChatId);

    await vi.waitFor(() => {
      expect(mocks.openEdit).toHaveBeenCalledWith({communityId: 123});
    });
    expect(mocks.togglePeerLink).toHaveBeenCalledWith({
      communityId: 123,
      peerId: (456 as ChatId).toPeerId(true),
      action: 'hidden'
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      langPackKey: 'Community.RequestSent'
    });
    expect(mocks.toast).not.toHaveBeenCalledWith({
      langPackKey: 'Error.AnError'
    });

    dispose();
    container.remove();
  });
});
