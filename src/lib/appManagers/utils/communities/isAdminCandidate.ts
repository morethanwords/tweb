import {Chat, User} from '@layer';

export default function isCommunityAdminCandidate(
  peer?: Chat | User
): peer is User.user {
  return peer?._ === 'user' && !peer.pFlags.bot;
}
