/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message} from '../layer';
/* import findUpClassName from "../helpers/dom/findUpClassName";
import rootScope from "../lib/rootScope";
import Transition from "./transition"; */

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

type C = 'check' | 'checks' | 'sending' | 'sendingerror' | 'premium_lock';
export function setSendingStatus(
  container: HTMLElement,
  message?: C | Message.message | Message.messageService,
  disableAnimationIfRippleFound?: boolean
) {
  let className: C;
  if(typeof(message) === 'string') {
    className = message;
  } else if(message?.pFlags.out) {
    if(message.error) {
      className = 'sendingerror';
    } else if(message.pFlags.is_outgoing) {
      className = 'sending';
    } else if(message.pFlags.unread) {
      className = 'check';
    } else {
      className = 'checks';
    }
  }

  if(!className) {
    container.textContent = '';
    return;
  }

  const iconClassName = 'tgico-' + className;
  const lastElement = container.lastElementChild as HTMLElement;
  if(lastElement && lastElement.classList.contains(iconClassName)) {
    return;
  }

  const element = document.createElement('i');
  element.classList.add('sending-status-icon', /* 'transition-item', */ iconClassName);
  container.append(element);

  if(lastElement) {
    lastElement.remove();
  }

  /* if(!lastElement) {
    element.classList.add('active');
    return;
  }

  const select = Transition(container, undefined, 350, () => {
    lastElement.remove();
  }, false, true, false);

  let animate = rootScope.settings.animationsEnabled && className !== 'sending' && !lastElement.classList.contains('tgico-sending');
  if(disableAnimationIfRippleFound && animate) {
    const parent = findUpClassName(container, 'rp');
    if(parent.querySelector('.c-ripple__circle') || parent.matches(':hover')) {
      animate = false;
    }
  }

  select(element, animate, lastElement); */

  /* SetTransition(lastElement, 'is-visible', false, 350, () => {
    // lastElement.remove();
  }, 2);
  SetTransition(element, 'is-visible', true, 350, undefined, 2); */
}
