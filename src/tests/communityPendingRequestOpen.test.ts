import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {CommunityPeerRequest} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  peers: {} as Record<PeerId, any>
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => mocks.peers[peerId]
  }
}));
vi.mock('@lib/appImManager', () => ({
  default: {
    setInnerPeer: vi.fn()
  }
}));
vi.mock('@components/popups/communityPrivateChat', () => ({
  default: vi.fn()
}));

import {
  getCommunityRequestOpenPeerId,
  isCommunityRequestPrivate
} from '@components/communities/communityRequestNavigation';

const channelId = 10 as ChatId;
const peerId = channelId.toPeerId(true);
const requesterId = (20 as UserId).toPeerId(false);
const makeRequest = (visible = true): CommunityPeerRequest => ({
  _: 'communityPeerRequest',
  pFlags: visible ? {visible: true} : {},
  peer: {_: 'peerChannel', channel_id: channelId},
  requested_by: requesterId.toUserId(),
  date: 1
});

describe('Community pending request navigation', () => {
  beforeEach(() => {
    mocks.peers = {
      [requesterId]: {
        _: 'user',
        id: requesterId.toUserId(),
        pFlags: {}
      }
    };
  });

  it('opens a public suggested chat even when it is proposed as hidden', () => {
    mocks.peers[peerId] = {
      _: 'channel',
      id: channelId,
      pFlags: {left: true},
      username: 'public_group'
    };
    const request = makeRequest(false);

    expect(isCommunityRequestPrivate(request)).toBe(false);
    expect(getCommunityRequestOpenPeerId(request)).toBe(peerId);
  });

  it('keeps a visible invite-only forum openable', () => {
    mocks.peers[peerId] = {
      _: 'channel',
      id: channelId,
      pFlags: {forum: true, left: true}
    };
    const request = makeRequest();

    expect(isCommunityRequestPrivate(request)).toBe(false);
    expect(getCommunityRequestOpenPeerId(request)).toBe(peerId);
  });

  it('keeps an invite-only chat openable for its members', () => {
    mocks.peers[peerId] = {
      _: 'channel',
      id: channelId,
      pFlags: {}
    };
    const request = makeRequest(false);

    expect(isCommunityRequestPrivate(request)).toBe(false);
    expect(getCommunityRequestOpenPeerId(request)).toBe(peerId);
  });

  it('routes a hidden inaccessible invite-only chat through its owner', () => {
    mocks.peers[peerId] = {
      _: 'channel',
      id: channelId,
      pFlags: {left: true}
    };
    const request = makeRequest(false);

    expect(isCommunityRequestPrivate(request)).toBe(true);
    expect(getCommunityRequestOpenPeerId(request)).toBe(requesterId);
  });
});
