/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '@helpers/dom/clickEvent';
import I18n, {LangPackKey, FormatterArguments, i18n} from '@lib/langPack';
import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import Button from '@components/button';
import PopupDatePicker from '@components/popups/datePicker';
import Row from '@components/row';
import InlineSelect from '@components/sidebarLeft/tabs/passcodeLock/inlineSelect';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import rootScope from '@lib/rootScope';
import Icon from '@components/icon';
import {hideToast, toastNew} from '@components/toast';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupPremium from './premium';

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

const DAY = 86400;
const REPEAT_OPTIONS: {value: number, label: () => HTMLElement}[] = [
  {value: 0, label: () => i18n('Never')},
  {value: DAY, label: () => i18n('Schedule.Repeat.Daily')},
  {value: 7 * DAY, label: () => i18n('Schedule.Repeat.Weekly')},
  {value: 14 * DAY, label: () => i18n('Schedule.Repeat.Biweekly')},
  {value: 30 * DAY, label: () => i18n('Schedule.Repeat.Monthly')},
  {value: 91 * DAY, label: () => i18n('Schedule.Repeat.Every3Months')},
  {value: 182 * DAY, label: () => i18n('Schedule.Repeat.Every6Months')},
  {value: 365 * DAY, label: () => i18n('Schedule.Repeat.Yearly')}
];

export default class PopupSchedule extends PopupDatePicker {
  private canSendWhenOnline: boolean;
  private isCustomButtonText: boolean;
  protected repeatPeriod: number;

  constructor(options: {
    initDate: Date,
    minDate?: Date,
    maxDate?: Date,
    onPick: (timestamp: number, repeatPeriod?: number) => void,
    canSendWhenOnline?: boolean,
    addMinutes?: boolean,
    canRepeat?: boolean,
    initRepeatPeriod?: number,
    btnConfirmLangKey?: LangPackKey
    btnDangerLangKey?: LangPackKey
  }) {
    super(
      checkDate(options.initDate, options.addMinutes ? 10 : undefined),
      (timestamp) => options.onPick(timestamp, this.repeatPeriod || undefined),
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

    this.repeatPeriod = options.initRepeatPeriod || 0;
    this.canSendWhenOnline = options.canSendWhenOnline;
    this.isCustomButtonText = !!options.btnConfirmLangKey;

    this.element.classList.add('popup-schedule');
    this.header.append(this.controlsDiv);
    this.title.replaceWith(this.monthTitle);
    if(options.canRepeat) {
      this.constructRepeatRow(options.initRepeatPeriod || 0);
    }

    this.body.append(this.btnConfirm);

    if(options.canSendWhenOnline) {
      const btnSendWhenOnline = Button('btn-primary btn-secondary btn-primary-transparent primary popup-schedule-secondary', {text: 'Schedule.SendWhenOnline'});
      this.body.append(btnSendWhenOnline);

      attachClickEvent(btnSendWhenOnline, () => {
        options.onPick(SEND_WHEN_ONLINE_TIMESTAMP);
        this.hide();
      });
    }

    if(options.btnDangerLangKey) {
      const btnDanger = Button('btn-primary btn-secondary btn-primary-transparent danger popup-schedule-secondary text-uppercase', {text: options.btnDangerLangKey});
      this.body.append(btnDanger);

      attachClickEvent(btnDanger, () => {
        options.onPick(undefined);
        this.hide();
      });
    }

    if(options.btnConfirmLangKey) {
      this.btnConfirm.replaceChildren(i18n(options.btnConfirmLangKey));
      this.btnConfirm.classList.add('text-uppercase');
    }
  }

  private constructRepeatRow(initRepeatPeriod: number) {
    const [repeatPeriod, setRepeatPeriod] = createSignal(initRepeatPeriod);
    const [selectOpen, setSelectOpen] = createSignal(false);

    const rightContent = document.createElement('div');
    const dispose = render(() => InlineSelect({
      get value() { return repeatPeriod(); },
      onChange: (value: number) => {
        setRepeatPeriod(value);
        this.repeatPeriod = value;
        setSelectOpen(false);
      },
      options: REPEAT_OPTIONS,
      get parent() { return row.container; },
      get isOpen() { return selectOpen(); },
      onClose: () => setSelectOpen(false)
    }), rightContent);
    this.middlewareHelper.get().onDestroy(dispose);

    if(!rootScope.premium) {
      rightContent.append(Icon('premium_lock', 'primary'));
    }

    const row = new Row({
      titleLangKey: 'Schedule.Repeat',
      clickable: () => {
        if(!rootScope.premium) {
          toastNew({
            langPackKey: 'Schedule.Repeat.PremiumRequired',
            langPackArguments: [
              anchorCallback(() => {
                hideToast()
                PopupPremium.show();
              })
            ]
          });
          return;
        }
        setSelectOpen((v) => !v);
      },
      rightContent
    });
    row.container.classList.add('popup-schedule-repeat');

    this.body.append(row.container);
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
