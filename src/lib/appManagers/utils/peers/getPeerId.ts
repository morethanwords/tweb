import isObject from '../../../../helpers/object/isObject';
import {InputChannel, InputPeer, InputUser, Peer} from '../../../../layer';
import {NULL_PEER_ID} from '../../../mtproto/mtproto_config';

export default function getPeerId(peerId: {user_id: UserId} | {channel_id: ChatId} | {chat_id: ChatId} | InputUser | InputPeer | InputChannel | PeerId | string): PeerId {
  if(peerId !== undefined && ((peerId as string).isPeerId ? (peerId as string).isPeerId() : false)) return peerId as PeerId;
  // if(typeof(peerId) === 'string' && /^[uc]/.test(peerId)) return peerId as PeerId;
  // if(typeof(peerId) === 'number') return peerId;
  else if(isObject(peerId)) {
    const userId = (peerId as Peer.peerUser).user_id;
    if(userId !== undefined) {
      return userId.toPeerId(false);
    }

    const chatId = (peerId as Peer.peerChannel).channel_id || (peerId as Peer.peerChat).chat_id;
    if(chatId !== undefined) {
      return chatId.toPeerId(true);
    }

    return NULL_PEER_ID; // maybe it is an inputPeerSelf
  // } else if(!peerId) return 'u0';
  } else if(!peerId) return NULL_PEER_ID;

  const isUser = (peerId as string).charAt(0) === 'u';
  const peerParams = (peerId as string).substr(1).split('_');

  return isUser ? peerParams[0].toPeerId() : (peerParams[0] || '').toPeerId(true);
}
