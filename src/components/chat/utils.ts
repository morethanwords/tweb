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

const shiftedIcons = [DurationType.Days, DurationType.Years]

const typeToIcon: Partial<Record<DurationType, Icon>> = {
  [DurationType.Days]: 'auto_delete_circle_days',
  [DurationType.Weeks]: 'auto_delete_circle_weeks',
  [DurationType.Months]: 'auto_delete_circle_months',
  [DurationType.Years]: 'auto_delete_circle_years'
};

const durationToIcon: Partial<Record<number, Icon>> = {
  1: 'auto_delete_circle_1',
  2: 'auto_delete_circle_2',
  3: 'auto_delete_circle_3',
  4: 'auto_delete_circle_4',
  5: 'auto_delete_circle_5',
  6: 'auto_delete_circle_6'
};

export function createAutoDeleteIcon(period?: number) {
  const defaultResult = () => Icon('auto_delete_circle_clock');

  if(!period) return defaultResult();

  const option = findMatchingCustomOption(period);
  if(!option) return defaultResult();

  const durationIcon = durationToIcon[option.duration];
  const typeIcon = typeToIcon[option.type];

  if(!durationIcon || !typeIcon) return defaultResult();

  const isShifted = shiftedIcons.includes(option.type);

  return OverlayedIcon(
    [
      'auto_delete_circle_empty',
      {
        icon: durationIcon,
        className: isShifted ? 'auto-delete-icon--shifted' : undefined
      },
      {
        icon: typeIcon,
        className: isShifted ? 'auto-delete-icon--shifted' : undefined
      }
    ],
  );
}

export type AttachedMediaType = 'document' | 'media';

type CanUploadAsWhenEditingArgs = {
  asWhat: AttachedMediaType;
  message: Message.message | null | undefined;
};

const allowedDocumentTypesAsGroup: Array<Document.document['type']> = ['audio', 'photo', 'pdf'];

export const canUploadAsWhenEditing = ({asWhat, message}: CanUploadAsWhenEditingArgs) => {
  if(!message || !message.media) return true;

  const isGrouped = !!message.grouped_id;
  if(!isGrouped) return true;

  const currentMediaType: AttachedMediaType = (() => {
    if(message.media._ === 'messageMediaDocument') {
      if(message.media.document?._ !== 'document') return null;
      if(message.media.document.type === 'video') return 'media';
      if(message.media.document.type && !allowedDocumentTypesAsGroup.includes(message.media.document.type)) return null;

      return 'document';
    }

    if(message.media._ === 'messageMediaPhoto') {
      return 'media';
    }

    return null;
  })();

  return currentMediaType === asWhat;
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
