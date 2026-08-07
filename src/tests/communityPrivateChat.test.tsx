import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  peers: {} as Record<PeerId, any>,
  popupFactory: undefined as (() => any) | undefined,
  setInnerPeer: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => mocks.peers[peerId]
  }
}));
vi.mock('@lib/appImManager', () => ({
  default: {
    setInnerPeer: mocks.setInnerPeer
  }
}));
vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: unknown[]) => {
    return args?.length ? `${key}:${args.join(',')}` : key;
  }
}));
vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: any) => (
    <span data-testid="private-chat-avatar" data-peer-id={props.peerId} />
  )
}));
vi.mock('@components/iconTsx', () => ({
  IconTsx: (props: any) => (
    <span class={props.class} data-icon={props.icon} />
  )
}));
vi.mock('@components/peerTitleTsx', () => ({
  PeerTitleTsx: () => <span>Private Channel</span>
}));
vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: any) => (
    <div data-testid="media-header">{props.children}</div>
  );
  MediaHeader.Sticker = (props: any) => (
    <div data-testid="media-header-sticker">{props.element}</div>
  );
  MediaHeader.Title = (props: any) => (
    <div data-testid="media-header-title">{props.children}</div>
  );
  MediaHeader.Subtitle = (props: any) => (
    <div data-testid="media-header-subtitle">{props.children}</div>
  );
  return {default: MediaHeader};
});
vi.mock('@components/popups/indexTsx', () => {
  const PopupElement = (props: any) => <div>{props.children}</div>;
  PopupElement.Header = (props: any) => <div>{props.children}</div>;
  PopupElement.CloseButton = () => <button data-testid="close" />;
  PopupElement.Body = (props: any) => <div>{props.children}</div>;
  PopupElement.Footer = (props: any) => <div>{props.children}</div>;
  PopupElement.FooterButton = (props: any) => (
    <button
      data-testid="footer-button"
      data-cancel={String(!!props.cancel)}
      data-color={props.color || 'primary'}
      disabled={props.disabled}
      onClick={props.callback}
    >
      {props.children || props.langKey}
    </button>
  );

  return {
    default: PopupElement,
    createPopup: (factory: () => any) => {
      mocks.popupFactory = factory;
    }
  };
});

import showCommunityPrivateChat from '@components/popups/communityPrivateChat';

const channelId = 10 as ChatId;
const peerId = channelId.toPeerId(true);

describe('Community private chat sheet', () => {
  let dispose: () => void;

  beforeEach(() => {
    mocks.popupFactory = undefined;
    mocks.setInnerPeer.mockClear();
    mocks.peers = {
      [peerId]: {
        _: 'channel',
        id: channelId,
        pFlags: {broadcast: true}
      }
    };
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('shows an accessible channel with Message Owner and Open Channel', () => {
    showCommunityPrivateChat({
      peerId,
      requestedByPeerId: 20 as PeerId,
      memberCount: 42,
      canOpenChat: true
    });
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(
      () => mocks.popupFactory!(),
      container
    );

    expect(container.textContent).toContain('Subscribers:42');
    expect(container.querySelector('[data-testid="media-header"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="media-header-sticker"]'))
    .not.toBeNull();
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="footer-button"]'
    )];
    expect(buttons.map((button) => button.textContent)).toEqual([
      'OpenChannel2',
      'Community.MessageChannelOwner'
    ]);
    expect(buttons[0].dataset.color).toBe('secondary');
    expect(buttons.some((button) => button.dataset.cancel === 'true'))
    .toBe(false);
    expect(container.textContent).toContain(
      'Community.PrivateChannelInfo'
    );
    expect(container.textContent).not.toContain(
      'Community.SuggestedChannel'
    );
    const infoIcon = container.querySelector('[data-icon="eye2"]');
    expect(infoIcon).not.toBeNull();
    expect(infoIcon.classList).toContain('inline-icon');
    expect(infoIcon.classList).toContain('inline-icon-left');

    buttons[0].click();
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId});
  });

  it('uses Open Chat for a group', () => {
    mocks.peers[peerId].pFlags = {};
    showCommunityPrivateChat({
      peerId,
      requestedByPeerId: 20 as PeerId,
      canOpenChat: true
    });
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => mocks.popupFactory!(), container);

    expect(container.querySelector<HTMLButtonElement>(
      '[data-testid="footer-button"]'
    ).textContent).toBe('OpenChat');
  });

  it('does not offer Open Chat for an inaccessible request', () => {
    showCommunityPrivateChat({
      peerId,
      requestedByPeerId: 20 as PeerId,
      memberCount: 42,
      canOpenChat: false
    });
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => mocks.popupFactory!(), container);

    expect([...container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="footer-button"]'
    )].map((button) => button.textContent)).toEqual([
      'Community.MessageChannelOwner'
    ]);
  });
});
