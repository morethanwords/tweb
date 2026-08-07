import type {Chat, CommunityPeer, User} from '@layer';
import type {Dialog} from '@appManagers/appMessagesManager';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';

export type CommunityLinkedPeerKind =
  'joined' |
  'viewable' |
  'requestable' |
  'hidden' |
  'excluded';

type Peer = Chat | User;

export function isCommunityLinkedPeerJoined(
  peer: Peer,
  dialog?: Dialog
) {
  if(peer?._ === 'user') {
    return !!dialog;
  }

  return peer?._ === 'channel' && !peer.pFlags.left;
}

export default function getCommunityLinkedPeerKind(
  peer: Peer,
  linked: CommunityPeer,
  dialog?: Dialog
): CommunityLinkedPeerKind {
  if(isCommunityLinkedPeerJoined(peer, dialog)) {
    return 'joined';
  }

  if(peer?._ === 'user') {
    if(peer.pFlags.bot) {
      return 'viewable';
    }

    if(linked.pFlags.can_view_history) {
      return 'viewable';
    }

    if(linked.visible === false) {
      return !getPeerActiveUsernames(peer).length ? 'hidden' : 'excluded';
    }

    return 'requestable';
  }

  if(linked.pFlags.can_view_history) {
    return 'viewable';
  }

  if(linked.visible === false) {
    return !getPeerActiveUsernames(peer).length ? 'hidden' : 'excluded';
  }

  return 'requestable';
}
