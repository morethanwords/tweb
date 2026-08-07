import type {Chat, User} from '@layer';

/**
 * The Community a chat or a user is linked to, if any. Only channels and users can carry
 * the link, so anything else resolves to undefined rather than reading a missing field.
 */
export default function getLinkedCommunityId(peer: Chat | User) {
  return peer?._ === 'channel' || peer?._ === 'user' ?
    peer.linked_community_id?.toChatId() :
    undefined;
}
