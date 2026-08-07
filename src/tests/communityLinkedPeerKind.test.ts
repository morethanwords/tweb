import getCommunityLinkedPeerKind
from '@appManagers/utils/communities/getCommunityLinkedPeerKind';
import type {Chat, CommunityPeer} from '@layer';

function makeLeftChannel(username?: string): Chat.channel {
  return {
    _: 'channel',
    pFlags: {
      left: true,
      megagroup: true
    },
    id: 100,
    access_hash: 1,
    title: 'Group',
    username,
    photo: {_: 'chatPhotoEmpty'},
    date: 1
  };
}

function makeHiddenLink(): CommunityPeer {
  return {
    _: 'communityPeer',
    pFlags: {},
    visible: false,
    peer: {
      _: 'peerChannel',
      channel_id: 100
    }
  };
}

describe('Community linked peer classification', () => {
  test('keeps a hidden private chat in the inaccessible section', () => {
    expect(getCommunityLinkedPeerKind(
      makeLeftChannel(),
      makeHiddenLink()
    )).toBe('hidden');
  });

  test('excludes a public chat when the link is hidden', () => {
    expect(getCommunityLinkedPeerKind(
      makeLeftChannel('public_group'),
      makeHiddenLink()
    )).toBe('excluded');
  });
});
