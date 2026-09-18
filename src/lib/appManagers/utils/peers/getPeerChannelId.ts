import {Peer} from '@layer';

export default function getPeerChannelId(peer: Peer): ChatId {
  return peer?._ === 'peerChannel' ? peer.channel_id : undefined;
}
