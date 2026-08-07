import type {Chat, User} from '@layer';
import {i18n} from '@lib/langPack';

type CommunityPeer = Chat | User;

export function getCommunityPeerParticipantsCount(peer?: CommunityPeer) {
  if(peer?._ === 'channel' || peer?._ === 'chat') {
    return peer.participants_count;
  }
}

export function getCommunityPeerSubtitle(peer?: CommunityPeer) {
  if(peer?._ === 'user' && peer.pFlags.bot) {
    return i18n('Bot');
  }

  const participantsCount = getCommunityPeerParticipantsCount(peer);
  if(participantsCount !== undefined) {
    return i18n(
      peer?._ === 'channel' && !peer.pFlags.megagroup ?
        'Subscribers' :
        'Members',
      [participantsCount]
    );
  }

  return peer?._ === 'channel' && !peer.pFlags.megagroup ?
    i18n('Channel') :
    i18n('Group');
}
