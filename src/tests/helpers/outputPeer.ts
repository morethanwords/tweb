import {Peer} from '@layer';

/** the Peer of a user or of a basic group, as appPeersManager.getOutputPeer gives it, with no chats to look at */
export default function outputPeer(peerId: PeerId): Peer.peerUser | Peer.peerChat {
  return peerId.isUser() ?
    {_: 'peerUser', user_id: peerId.toUserId()} :
    {_: 'peerChat', chat_id: peerId.toChatId()};
}
