import type {Chat, User} from '@layer';

/**
 * A Community the user is still in and has folded into a single chat-list row, which is
 * what hides its member chats from the list and projects them under the Community.
 *
 * Half the call sites ask this inverted ("skip unless folded"), so keeping the three
 * conditions in one place is what stops an inverted copy from drifting.
 */
export default function isCollapsedCommunity(peer: Chat | User): peer is Chat.community {
  return peer?._ === 'community' &&
    !peer.pFlags.left &&
    !!peer.pFlags.collapsed_in_dialogs;
}
