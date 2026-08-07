import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {CommunityPeerRequest} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  peers: {} as Record<PeerId, any>,
  setInnerPeer: vi.fn(),
  showCommunityPrivateChat: vi.fn()
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
vi.mock('@components/popups/communityPrivateChat', () => ({
  default: mocks.showCommunityPrivateChat
}));
vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: unknown[]) => {
    return document.createTextNode(
      args?.length ? `${key}:${args.join(',')}` : key
    );
  }
}));
vi.mock('@components/peerTitleTsx', () => ({
  PeerTitleTsx: (props: any) => (
    <span data-peer-title={props.peerId}>Peer {props.peerId}</span>
  )
}));
vi.mock('@components/buttonTsx', () => ({
  default: (props: any) => (
    <button
      data-testid={props.text}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  )
}));
vi.mock('@components/iconTsx', () => ({
  IconTsx: (props: any) => <span data-icon={props.icon} />
}));
vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: any) => (
    <span data-avatar-peer-id={props.peerId} data-avatar-size={props.size} />
  )
}));
vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => (
    <div
      data-testid="row"
      onClick={props.clickable}
      onKeyDown={props['on:keydown']}
    >
      {props.children}
    </div>
  );
  Row.Media = (props: any) => <div data-testid="media">{props.children}</div>;
  Row.Title = (props: any) => (
    <div data-testid="title">
      {props.children}
      <span data-testid="title-right">{props.titleRight}</span>
    </div>
  );
  Row.Subtitle = (props: any) => (
    <div data-testid="subtitle">{props.children}</div>
  );
  return {default: Row};
});

import {
  CommunityPendingRequestRow
} from '@components/communities/communityPendingRequest';

const channelId = 10 as ChatId;
const peerId = channelId.toPeerId(true);
const requesterId = (20 as UserId).toPeerId(false);

const makeRequest = (visible: boolean): CommunityPeerRequest => ({
  _: 'communityPeerRequest',
  pFlags: visible ? {visible: true} : {},
  peer: {_: 'peerChannel', channel_id: channelId},
  requested_by: requesterId.toUserId(),
  date: 1
});

describe('CommunityPendingRequestRow', () => {
  let dispose: () => void;

  beforeEach(() => {
    mocks.setInnerPeer.mockClear();
    mocks.showCommunityPrivateChat.mockClear();
    mocks.peers = {
      [peerId]: {
        _: 'channel',
        id: channelId,
        pFlags: {},
        participants_count: 42
      },
      [requesterId]: {
        _: 'user',
        id: requesterId.toUserId(),
        pFlags: {}
      }
    };
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('puts the member icon in titleRight and keeps suggestion in subtitle', () => {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityPendingRequestRow
        request={makeRequest(true)}
        onApply={vi.fn()}
      />
    ), container);

    const subtitle = container.querySelector('[data-testid="subtitle"]');
    const titleRight = container.querySelector('[data-testid="title-right"]');
    expect(titleRight.textContent).toContain('42');
    expect(titleRight.querySelector('[data-icon="group_filled"]')).not.toBeNull();
    expect(subtitle.textContent).toContain('Community.SuggestedGroup');
    expect(subtitle.textContent).not.toContain('Members:42');
    expect(subtitle.textContent).not.toContain('Community.Visible');
    expect(subtitle.textContent).not.toContain('Community.Hidden');
  });

  it('puts the hidden icon in titleRight only for a hidden request', () => {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityPendingRequestRow
        request={makeRequest(false)}
        onApply={vi.fn()}
      />
    ), container);

    const titleRight = container.querySelector('[data-testid="title-right"]');
    expect(titleRight.querySelector('[data-icon="group_filled"]')).not.toBeNull();
    expect(titleRight.querySelector('[data-icon="eye2"]')).not.toBeNull();
  });

  it('keeps Add and Decline below the subtitle without opening the request', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const onApply = vi.fn();
    dispose = render(() => (
      <CommunityPendingRequestRow
        request={makeRequest(true)}
        onApply={onApply}
      />
    ), container);

    const subtitle = container.querySelector('[data-testid="subtitle"]');
    const add = container.querySelector<HTMLButtonElement>('[data-testid="Add"]');
    const decline = container.querySelector<HTMLButtonElement>('[data-testid="Decline"]');
    expect(subtitle.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();

    add.click();
    expect(onApply).toHaveBeenCalledWith(expect.anything(), false);
    expect(mocks.showCommunityPrivateChat).not.toHaveBeenCalled();

    decline.click();
    expect(onApply).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('passes the cached member count to the private chat sheet', () => {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityPendingRequestRow
        request={makeRequest(true)}
        onApply={vi.fn()}
      />
    ), container);

    (container.querySelector('[data-testid="row"]') as HTMLButtonElement).click();

    expect(mocks.showCommunityPrivateChat).toHaveBeenCalledWith({
      peerId,
      requestedByPeerId: requesterId,
      memberCount: 42,
      canOpenChat: true
    });
  });

  it('opens the popup instead of navigating to an accessible chat', () => {
    mocks.peers[peerId].username = 'public_group';
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityPendingRequestRow
        request={makeRequest(true)}
        onApply={vi.fn()}
      />
    ), container);

    (container.querySelector('[data-testid="row"]') as HTMLElement).click();

    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
    expect(mocks.showCommunityPrivateChat).toHaveBeenCalledWith({
      peerId,
      requestedByPeerId: requesterId,
      memberCount: 42,
      canOpenChat: true
    });
  });
});
