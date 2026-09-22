import getPeerIdsFromMessage
from '@appManagers/utils/messages/getPeerIdsFromMessage';
import lang from '@/lang';
import '@helpers/peerIdPolyfill';

describe('layer 229 joined-via-community service action', () => {
  test('retains the community a joiner came through', () => {
    const communityId = 200 as ChatId;
    const peerIds = getPeerIdsFromMessage({
      _: 'messageService',
      pFlags: {},
      id: 1,
      peer_id: {_: 'peerChannel', channel_id: 100},
      from_id: {_: 'peerUser', user_id: 50},
      date: 1,
      action: {
        _: 'messageActionChatJoinedViaCommunity',
        community_id: communityId
      }
    } as any);

    expect(peerIds).toContain(communityId.toPeerId(true));
  });

  test('has both wordings, with and without a known community', () => {
    // the named variant takes the joiner and the community, the fallback only the joiner
    expect(lang['Chat.Service.JoinedViaCommunity']).toContain('%1$s');
    expect(lang['Chat.Service.JoinedViaCommunity']).toContain('%2$s');
    expect(lang['Chat.Service.JoinedViaCommunity.Unknown']).toContain('%1$s');
    expect(lang['Chat.Service.JoinedViaCommunity.Unknown']).not.toContain('%2$s');
  });
});
