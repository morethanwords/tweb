import {Message} from '../../layer';
import {AdminLog} from '../../lib/appManagers/appChatsManager';
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

export function getMid(message: MyMessage | AdminLog) {
  if(message._ === 'channelAdminLogEvent') return +message.id;
  return message.mid;
}

export function isMessage(message: Message | AdminLog) {
  return message._ === 'message' || message._ === 'messageService';
}
