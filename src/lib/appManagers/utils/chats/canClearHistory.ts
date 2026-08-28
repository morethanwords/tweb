import type {Chat, User} from '@layer';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import hasRights from './hasRights';

/**
 * Mirrors tdesktop's `Filler::addClearHistory` (`window_peer_menu.cpp`): a private chat
 * always offers it, a channel only while we are still in it and either we may delete its
 * messages or it is a private, non-forum group. Topics, monoforum threads and the saved
 * sublists have no clear-history of their own — the caller rules those out by thread.
 */
export default function canClearHistory(peer: Chat | User) {
  if(peer?._ === 'user') {
    return true;
  }

  if(peer?._ === 'chat') {
    return !peer.pFlags.deactivated;
  }

  if(peer?._ !== 'channel' || peer.pFlags.left || peer.pFlags.monoforum) {
    return false;
  }

  return hasRights(peer, 'delete_messages') || (
    !!peer.pFlags.megagroup &&
    !peer.pFlags.forum &&
    !getPeerActiveUsernames(peer)[0]
  );
}
