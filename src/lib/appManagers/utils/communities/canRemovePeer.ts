import hasRights from '@appManagers/utils/chats/hasRights';
import type {Chat, User} from '@layer';

export default function canRemoveCommunityPeer(
  community: Chat,
  peer: Chat | User
) {
  if(
    community?._ === 'community' &&
    hasRights(community, 'manage_linked_peers')
  ) {
    return true;
  }

  if(peer?._ === 'user') {
    return false;
  }

  return (
    peer?._ === 'chat' ||
    peer?._ === 'channel'
  ) && !!peer.pFlags.creator;
}
