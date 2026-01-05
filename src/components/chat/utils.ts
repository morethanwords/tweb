import {formatFullSentTimeRaw, formatTime} from '../../helpers/date';
import {DurationType} from '../../helpers/formatDuration';
import {Message} from '../../layer';
import {AdminLog} from '../../lib/appManagers/appChatsManager';
import {MyMessage} from '../../lib/appManagers/appMessagesManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {VERIFICATION_CODES_BOT_ID} from '../../lib/mtproto/mtproto_config';
import Icon, {OverlayedIcon} from '../icon';
import {findMatchingCustomOption} from '../sidebarLeft/tabs/autoDeleteMessages/options';


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


/*
// TODO: Backup, Cleanup

  const typeToLetter: Partial<Record<DurationType, string>> = {
    [DurationType.Days]: 'D',
    [DurationType.Weeks]: 'W',
    [DurationType.Months]: 'M',
    [DurationType.Years]: 'Y'
  };

  export function createAutoDeleteIcon(period?: number) {
    const defaultResult = () => Icon('auto_delete_circle_clock');

    if(!period) return defaultResult();

    const option = findMatchingCustomOption(period);
    if(!option || option.duration > 9) return defaultResult();

    const letter = typeToLetter[option.type];
    if(!letter) return defaultResult();

    const span = document.createElement('span');
    span.classList.add('auto-delete-icon');

    span.append(Icon('auto_delete_circle_empty'));

    const durationSpan = document.createElement('span');
    durationSpan.classList.add('auto-delete-icon__duration');
    durationSpan.textContent = `${option.duration}${letter}`;

    span.append(durationSpan)

    return span;
  }

*/
