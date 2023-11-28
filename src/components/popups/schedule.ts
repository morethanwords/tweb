/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../helpers/dom/clickEvent';
import I18n, {LangPackKey, FormatterArguments, i18n} from '../../lib/langPack';
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

const checkDate = (date: Date, addMinutes?: number) => {
  const ret = date.getTime() > getMaxDate().getTime() ? new Date() : date;
  if(addMinutes) {
    ret.setMinutes(ret.getMinutes() + addMinutes);
  }
  return ret;
};

export default class PopupSchedule extends PopupDatePicker {
  private canSendWhenOnline: boolean;
  private isCustomButtonText: boolean;

  constructor(options: {
    initDate: Date,
    minDate?: Date,
    maxDate?: Date,
    onPick: (timestamp: number) => void,
    canSendWhenOnline?: boolean,
    btnConfirmLangKey?: LangPackKey
  }) {
    super(
      checkDate(options.initDate, options.canSendWhenOnline !== undefined ? 10 : undefined),
      options.onPick,
      {
        noButtons: true,
        noTitle: true,
        closable: true,
        withConfirm: true,
        minDate: options.minDate ?? getMinDate(),
        maxDate: options.maxDate ?? getMaxDate(),
        withTime: true,
        showOverflowMonths: true,
        confirmShortcutIsSendShortcut: true,
        title: true
      }
    );

    this.canSendWhenOnline = options.canSendWhenOnline;
    this.isCustomButtonText = !!options.btnConfirmLangKey;

    this.element.classList.add('popup-schedule');
    this.header.append(this.controlsDiv);
    this.title.replaceWith(this.monthTitle);
    this.body.append(this.btnConfirm);

    if(options.canSendWhenOnline) {
      const btnSendWhenOnline = Button('btn-primary btn-secondary btn-primary-transparent primary popup-schedule-secondary', {text: 'Schedule.SendWhenOnline'});
      this.body.append(btnSendWhenOnline);

      attachClickEvent(btnSendWhenOnline, () => {
        options.onPick(SEND_WHEN_ONLINE_TIMESTAMP);
        this.hide();
      });
    }

    if(options.btnConfirmLangKey) {
      this.btnConfirm.replaceChildren(i18n(options.btnConfirmLangKey));
      this.btnConfirm.classList.add('text-uppercase');
    }
  }

  public setTimeTitle() {
    super.setTimeTitle();

    if(!(this.btnConfirm && this.selectedDate)) {
      return;
    }

    if(this.isCustomButtonText) {
      return;
    }

    let key: LangPackKey;
    const args: FormatterArguments = [];
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const timeOptions: Intl.DateTimeFormatOptions = {
      minute: '2-digit',
      hour: '2-digit'
    };

    const sendDate = new Date(this.selectedDate.getTime());
    sendDate.setHours(+this.hoursInputField.value, +this.minutesInputField.value);

    if(this.selectedDate.getTime() === date.getTime()) {
      key = 'Schedule.SendToday';
    }/*  else if(this.selectedDate.getTime() === (date.getTime() + 86400e3)) {
      dayStr = 'Tomorrow';
    } */ else {
      key = 'Schedule.SendDate';

      const dateOptions: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric'
      };

      if(sendDate.getFullYear() !== date.getFullYear()) {
        dateOptions.year = 'numeric';
      }

      args.push(new I18n.IntlDateElement({
        date: sendDate,
        options: dateOptions
      }).element);
    }

    args.push(new I18n.IntlDateElement({
      date: sendDate,
      options: timeOptions
    }).element);

    this.btnConfirm.replaceChildren(i18n(key, args));
  }
}
