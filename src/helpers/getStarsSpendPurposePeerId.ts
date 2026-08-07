import apiManagerProxy from '@lib/apiManagerProxy';
import {Chat, User} from '@layer';

/**
 * Peer the stars are about to be spent on, to be passed as `spend_purpose_peer` of `inputStorePaymentStarsTopup`.
 * Only bots and channels count as a purpose, monoforums resolve to their broadcast.
 */
export default function getStarsSpendPurposePeerId(peerId: PeerId): PeerId {
  if(!peerId) {
    return;
  }

  const peer = apiManagerProxy.getPeer(peerId) as Chat.channel | User.user;
  if(!peer) {
    return;
  }

  if(peer._ === 'channel') {
    return peer.pFlags?.monoforum && peer.linked_monoforum_id ?
      peer.linked_monoforum_id.toPeerId(true) :
      peerId;
  }

  return peer._ === 'user' && peer.pFlags?.bot ? peerId : undefined;
}
