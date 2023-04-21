/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {SEND_WHEN_ONLINE_TIMESTAMP} from '../../lib/mtproto/mtproto_config';
import Button from '../button';
import PopupDatePicker from './datePicker';

const getMinDate = () => {
  const date = new Date();
  // date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getMaxDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);
  return date;
};

const checkDate = (date: Date) => {
  return date.getTime() > getMaxDate().getTime() ? new Date() : date;
};

export default class PopupSchedule extends PopupDatePicker {
  constructor(initDate: Date, onPick: (timestamp: number) => void, canSendWhenOnline: boolean) {
    super(checkDate(initDate), onPick, {
      noButtons: true,
      noTitle: true,
      closable: true,
      withConfirm: true,
      minDate: getMinDate(),
      maxDate: getMaxDate(),
      withTime: true,
      showOverflowMonths: true,
      confirmShortcutIsSendShortcut: true,
      title: true
    });

    this.element.classList.add('popup-schedule');
    this.header.append(this.controlsDiv);
    this.title.replaceWith(this.monthTitle);
    this.body.append(this.btnConfirm);

    if(canSendWhenOnline) {
      const btnSendWhenOnline = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'Schedule.SendWhenOnline'});
      this.body.append(btnSendWhenOnline);

      attachClickEvent(btnSendWhenOnline, () => {
        onPick(SEND_WHEN_ONLINE_TIMESTAMP);
        this.hide();
      });
    }
  }
}
