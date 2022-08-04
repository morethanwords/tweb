/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatDateAccordingToTodayNew} from '../../helpers/date';
import {MyMessage} from '../../lib/appManagers/appMessagesManager';

export default function wrapSentTime(message: MyMessage) {
  const el: HTMLElement = document.createElement('span');
  el.classList.add('sent-time');
  el.append(formatDateAccordingToTodayNew(new Date(message.date * 1000)));

  return el;
}
