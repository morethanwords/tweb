import {AdminLog} from '@appManagers/appChatsManager';
import {MyMessage} from '@appManagers/appMessagesManager';
import {VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {wrapSlowModeLeftDuration} from '@components/wrappers/wrapDuration';
import {formatFullSentTimeRaw, formatTime} from '@helpers/date';
import eachSecond from '@helpers/eachSecond';
import {Document, Message} from '@layer';


export function isMessageForVerificationBot(message: MyMessage) {
  const isCorrectPeer = message.fromId === VERIFICATION_CODES_BOT_ID || getPeerId(message.peer_id) === VERIFICATION_CODES_BOT_ID;
  return isCorrectPeer && message._ === 'message';
}

export function isVerificationBot(peerId: PeerId) {
  return peerId === VERIFICATION_CODES_BOT_ID;
}

// * a guest-chat message (a guest bot's reply routed into this chat) carries guestchat_via_from —
// * the visitor (the user who invoked the bot); message.fromId stays the bot itself
export function isGuestChatMessage(message: MyMessage | AdminLog) {
  return message._ === 'message' && !!message.guestchat_via_from;
}

export function getGuestChatViaFromId(message: MyMessage | AdminLog): PeerId {
  return message._ === 'message' && message.guestchat_via_from ? getPeerId(message.guestchat_via_from) : undefined;
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

export function linkColor(el: string | Node) {
  if(typeof el === 'string') {
    const span = document.createElement('span');
    span.textContent = el;
    span.classList.add('link-color');
    return span;
  }

  if(el instanceof HTMLElement) el.classList.add('link-color');

  return el;
}


export type AttachedMediaType = 'document' | 'media';

type CanUploadAsWhenEditingArgs = {
  asWhat: AttachedMediaType;
  message: Message.message | null | undefined;
};

const allowedDocumentTypesAsGroup: Array<Document.document['type']> = ['audio', 'photo', 'pdf'];
const documentAsMediaTypes: Array<Document.document['type']> = ['gif', 'video'];

export const canUploadAsWhenEditing = ({asWhat, message}: CanUploadAsWhenEditingArgs) => {
  if(!message || !message.media) return true;

  const isGrouped = !!message.grouped_id;
  if(!isGrouped) return true;

  const currentMediaType = getMediaTypeForMessage(message);

  return currentMediaType === asWhat;
};

export const getMediaTypeForMessage = (message: Message.message | null | undefined): AttachedMediaType | null => {
  if(!message || !message.media) return null;

  if(message.media._ === 'messageMediaDocument') {
    if(message.media.document?._ !== 'document') return null;
    if(documentAsMediaTypes.includes(message.media.document.type)) return 'media';
    if(message.media.document.type && !allowedDocumentTypesAsGroup.includes(message.media.document.type)) return null;

    return 'document';
  }

  if(message.media._ === 'messageMediaPhoto') {
    return 'media';
  }

  return null;
};

export function slowModeTimer(getLeftDuration: () => number) {
  const s = document.createElement('span');
  const dispose = eachSecond(() => {
    const leftDuration = getLeftDuration();
    s.replaceChildren(wrapSlowModeLeftDuration(leftDuration));

    if(!leftDuration) {
      close();
    }
  }, true);
  return {element: s, dispose};
}
