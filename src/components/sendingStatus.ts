import {Message} from '@layer';
import Icon from '@components/icon';
import SendingStatusIcon, {getSendingStatusIconState, SendingStatusIconState, setSendingStatusIconState} from '@components/sendingStatusIcon';

export enum SENDING_STATUS {
  Error = -1,
  Pending,
  Sent,
  Read
}

export function getSendingStatus(message: Message.message | Message.messageService) {
  return message.pFlags.is_outgoing ?
    SENDING_STATUS.Pending : (
      message.pFlags.unread ?
      SENDING_STATUS.Sent :
      SENDING_STATUS.Read
    );
}

type C = SendingStatusIconState | 'premium_lock';
export function setSendingStatus(
  container: HTMLElement,
  message?: C | Message.message | Message.messageService,
  animate?: boolean
) {
  let state: C;
  if(typeof(message) === 'string') {
    state = message;
  } else if(message?.pFlags.out) {
    if(message.error) {
      state = 'error';
    } else if(message.pFlags.is_outgoing) {
      state = 'sending';
    } else if(message.pFlags.unread) {
      state = 'sent';
    } else {
      state = 'read';
    }
  }

  if(!state) {
    container.textContent = '';
    container.classList.add('hide');
    return;
  }

  container.classList.remove('hide');
  const lastElement = container.lastElementChild as HTMLElement;
  if(state === 'premium_lock') {
    if(!lastElement?.classList.contains('sending-status-icon-premium_lock')) {
      container.replaceChildren(Icon('premium_lock', 'sending-status-icon', 'sending-status-icon-premium_lock'));
    }

    return;
  }

  // the icon that is there grows into the new status
  const current = lastElement && getSendingStatusIconState(lastElement);
  if(current) {
    if(current !== state) {
      lastElement.classList.toggle('sending-status-icon-sendingerror', state === 'error');
      setSendingStatusIconState(lastElement, state, animate);
    }

    return;
  }

  const element = SendingStatusIcon(state, 'sending-status-icon');
  if(state === 'error') {
    element.classList.add('sending-status-icon-sendingerror');
  }

  container.replaceChildren(element);
}
