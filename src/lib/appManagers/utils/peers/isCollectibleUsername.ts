import {Chat, User} from '@layer';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';

/**
 * Every username of a peer's but the editable one, the peer's own, was bought on Fragment. A peer
 * with no `usernames` list has just the one, editable.
 */
export default function isCollectibleUsername(peer: User.user | Chat.channel, username: string) {
  return !!peer?.usernames?.some((item) => item.username === username) &&
    username !== getPeerEditableUsername(peer);
}
