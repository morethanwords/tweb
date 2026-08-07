import getCommunityServiceMessageKey, {
  getCommunityServiceTitle
} from '@components/wrappers/getCommunityServiceMessageKey';
import getPeerIdsFromMessage
from '@appManagers/utils/messages/getPeerIdsFromMessage';
import '@helpers/peerIdPolyfill';

describe('layer 228 community service actions', () => {
  test.each([
    ['bot', 'self', 'Chat.Service.CommunityAdded.Bot'],
    ['bot', 'user', 'Chat.Service.CommunityAdded.Bot'],
    ['channel', 'unknown', 'Chat.Service.CommunityAdded.Channel'],
    ['group', 'self', 'Chat.Service.CommunityAdded.Group.You'],
    ['group', 'user', 'Chat.Service.CommunityAdded.Group.By'],
    ['group', 'unknown', 'Chat.Service.CommunityAdded.Group.Unknown']
  ] as const)('renders an added %s action by %s', (peerKind, authorKind, key) => {
    expect(getCommunityServiceMessageKey({
      isAdded: true,
      peerKind,
      authorKind
    })).toBe(key);
  });

  test.each([
    ['bot', 'self', 'Chat.Service.CommunityRemoved.Bot'],
    ['channel', 'user', 'Chat.Service.CommunityRemoved.Channel'],
    ['group', 'self', 'Chat.Service.CommunityRemoved.Group.You'],
    ['group', 'user', 'Chat.Service.CommunityRemoved.Group.By'],
    ['group', 'unknown', 'Chat.Service.CommunityRemoved.Group.By']
  ] as const)('renders a removed %s action by %s', (peerKind, authorKind, key) => {
    expect(getCommunityServiceMessageKey({
      isAdded: false,
      peerKind,
      authorKind
    })).toBe(key);
  });

  test('uses the action id rather than cached title to detect an addition', () => {
    expect(getCommunityServiceMessageKey({
      isAdded: true,
      peerKind: 'group',
      authorKind: 'unknown'
    })).toBe('Chat.Service.CommunityAdded.Group.Unknown');
  });

  test('keeps the title of a forbidden Community for historical service cards', () => {
    expect(getCommunityServiceTitle({
      _: 'communityForbidden',
      id: 200,
      access_hash: 1,
      title: 'Former Community'
    })).toBe('Former Community');
  });

  test('retains a referenced Community with its service message', () => {
    const communityId = 200 as ChatId;
    const peerIds = getPeerIdsFromMessage({
      _: 'messageService',
      pFlags: {},
      id: 1,
      peer_id: {_: 'peerChannel', channel_id: 100},
      date: 1,
      action: {
        _: 'messageActionChangeCommunity',
        community_id: communityId
      }
    } as any);

    expect(peerIds).toContain(communityId.toPeerId(true));
  });
});
