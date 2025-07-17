import {MyMessage} from '../../lib/appManagers/appMessagesManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {VERIFICATION_CODES_BOT_ID} from '../../lib/mtproto/mtproto_config';


export function isMessageForVerificationBot(message: MyMessage) {
  const isCorrectPeer = message.fromId === VERIFICATION_CODES_BOT_ID || getPeerId(message.peer_id) === VERIFICATION_CODES_BOT_ID;
  return isCorrectPeer && message._ === 'message';
}

export function isVerificationBot(peerId: PeerId) {
  return peerId === VERIFICATION_CODES_BOT_ID;
}
