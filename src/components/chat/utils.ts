import {formatFullSentTimeRaw, formatTime} from '../../helpers/date';
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

export function makeTime(date: Date, includeDate?: boolean) {
  return includeDate ? formatFullSentTimeRaw(date.getTime() / 1000 | 0, {combined: true}).dateEl : formatTime(date);
};

export function generateTail(asSpan?: boolean) {
  if(asSpan) {
    const span = document.createElement('span');
    span.classList.add('bubble-tail');
    return span;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 11 20');
  svg.setAttributeNS(null, 'width', '11');
  svg.setAttributeNS(null, 'height', '20');
  svg.classList.add('bubble-tail');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#message-tail-filled');
  // use.classList.add('bubble-tail-use');

  svg.append(use);

  return svg;
}
