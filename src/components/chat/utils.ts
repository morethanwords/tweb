import {formatFullSentTimeRaw, formatTime} from '@helpers/date';
import {DurationType} from '@helpers/formatDuration';
import {Document, Message} from '@layer';
import {AdminLog} from '@appManagers/appChatsManager';
import {MyMessage} from '@appManagers/appMessagesManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import Icon, {OverlayedIcon} from '@components/icon';
import {findMatchingCustomOption} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';
import {wrapSlowModeLeftDuration} from '@components/wrappers/wrapDuration';
import eachSecond from '@helpers/eachSecond';
import {PollMessageContentProps} from './bubbleParts/pollMessageContent';


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

export function getPollMessageContentPropsFromMessage(message: Message.message): PollMessageContentProps | undefined {
  if(message.media?._ !== 'messageMediaPoll') return;

  const poll = message.media.poll;
  const flag = (value: any) => !!value;

  return {
    question: poll.question.text,
    questionEntities: poll.question.entities,
    description: message.message,
    descriptionEntities: message.entities,
    pollOptions: poll.answers.filter(answer => answer._ === 'pollAnswer').map(answer => ({
      text: answer.text.text,
      entities: answer.text.entities
    })),
    allowAddingOptions: flag(poll.pFlags.open_answers),
    allowMultipleAnswers: flag(poll.pFlags.multiple_choice),
    hasCorrectAnswer: flag(poll.pFlags.quiz),
    shuffleOptions: flag(poll.pFlags.shuffle_answers),
    showWhoVoted: flag(poll.pFlags.public_voters),
    closed: flag(poll.pFlags.closed),
    hideResults: flag(poll.pFlags.hide_results_until_close)
  };
}
