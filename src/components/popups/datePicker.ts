/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {PopupOptions} from '.';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import mediaSizes from '../../helpers/mediaSizes';
import I18n, {FormatterArguments, i18n, LangPackKey} from '../../lib/langPack';
import InputField from '../inputField';

export default class PopupDatePicker extends PopupElement {
  protected controlsDiv: HTMLElement;
  protected monthTitle: HTMLElement;
  protected prevBtn: HTMLElement;
  protected nextBtn: HTMLElement;

  protected monthsContainer: HTMLElement;
  protected month: HTMLElement;

  protected minMonth: Date;
  protected maxMonth: Date;
  protected minDate: Date;
  protected maxDate: Date;
  protected selectedDate: Date;
  protected selectedMonth: Date;
  protected selectedEl: HTMLElement;

  protected timeDiv: HTMLDivElement;
  protected hoursInputField: InputField;
  protected minutesInputField: InputField;

  constructor(
    initDate: Date,
    public onPick: (timestamp: number) => void,
    protected options: Partial<{
      noButtons: true,
      noTitle: true,
      minDate: Date,
      maxDate: Date
      withTime: true,
      showOverflowMonths: true
    }> & PopupOptions = {}
  ) {
    super('popup-date-picker', {
      body: true,
      overlayClosable: true,
      buttons: options.noButtons ? [] : [{
        langKey: 'JumpToDate',
        callback: () => {
          if(this.onPick) {
            this.onPick(this.selectedDate.getTime() / 1000 | 0);
          }
        }
      }, {
        langKey: 'Cancel',
        isCancel: true
      }],
      title: true,
      ...options
    });

    this.minDate = options.minDate || new Date('2013-08-01T00:00:00');

    if(initDate < this.minDate) {
      initDate.setFullYear(this.minDate.getFullYear(), this.minDate.getMonth(), this.minDate.getDate());
    }

    // Controls
    this.controlsDiv = document.createElement('div');
    this.controlsDiv.classList.add('date-picker-controls');

    this.prevBtn = document.createElement('button');
    this.prevBtn.classList.add('btn-icon', 'tgico-down', 'date-picker-prev');
    attachClickEvent(this.prevBtn, this.onPrevClick, {listenerSetter: this.listenerSetter});

    this.nextBtn = document.createElement('button');
    this.nextBtn.classList.add('btn-icon', 'tgico-down', 'date-picker-next');
    attachClickEvent(this.nextBtn, this.onNextClick, {listenerSetter: this.listenerSetter});

    this.monthTitle = document.createElement('div');
    this.monthTitle.classList.add('date-picker-month-title');

    this.controlsDiv.append(this.prevBtn, this.monthTitle, this.nextBtn);

    // Month
    this.monthsContainer = document.createElement('div');
    this.monthsContainer.classList.add('date-picker-months');
    attachClickEvent(this.monthsContainer, this.onDateClick, {listenerSetter: this.listenerSetter});

    this.body.append(this.controlsDiv, this.monthsContainer);

    // Time inputs
    if(options.withTime) {
      this.timeDiv = document.createElement('div');
      this.timeDiv.classList.add('date-picker-time');

      const delimiter = document.createElement('div');
      delimiter.classList.add('date-picker-time-delimiter');
      delimiter.append(':');

      const handleTimeInput = (
        max: number,
        inputField: InputField,
        onInput: (length: number) => void,
        onOverflow?: (number: number) => void
      ) => {
        const maxString = '' + max;
        this.listenerSetter.add(inputField.input)('input', (e) => {
          let value = inputField.value.replace(/\D/g, '');
          if(value.length > 2) {
            value = value.slice(0, 2);
          } else {
            if((value.length === 1 && +value[0] > +maxString[0]) || (value.length === 2 && +value > max)) {
              if(value.length === 2 && onOverflow) {
                onOverflow(+value[1]);
              }

              value = '0' + value[0];
            }
          }

          inputField.setValueSilently(value);
          onInput(value.length);
        });
      };

      this.hoursInputField = new InputField({plainText: true});
      this.minutesInputField = new InputField({plainText: true});

      handleTimeInput(23, this.hoursInputField, (length) => {
        if(length === 2) {
          this.minutesInputField.input.focus();
        }

        this.setTimeTitle();
      }, (number) => {
        this.minutesInputField.value = (number + this.minutesInputField.value).slice(0, 2);
      });
      handleTimeInput(59, this.minutesInputField, (length) => {
        if(!length) {
          this.hoursInputField.input.focus();
        }

        this.setTimeTitle();
      });

      this.selectedDate = initDate;

      // initDate.setMinutes(initDate.getMinutes() + 10);

      this.hoursInputField.setValueSilently(('0' + initDate.getHours()).slice(-2));
      this.minutesInputField.setValueSilently(('0' + initDate.getMinutes()).slice(-2));

      initDate.setHours(0, 0, 0, 0);

      this.timeDiv.append(this.hoursInputField.container, delimiter, this.minutesInputField.container);

      attachClickEvent(this.btnConfirm, () => {
        if(this.onPick) {
          this.selectedDate.setHours(+this.hoursInputField.value || 0, +this.minutesInputField.value || 0, 0, 0);
          this.onPick(this.selectedDate.getTime() / 1000 | 0);
        }

        this.hide();
      }, {listenerSetter: this.listenerSetter});

      this.body.append(this.timeDiv);

      this.prevBtn.classList.add('primary');
      this.nextBtn.classList.add('primary');
    }

    const popupCenterer = document.createElement('div');
    popupCenterer.classList.add('popup-centerer');
    popupCenterer.append(this.container);
    this.element.append(popupCenterer);

    // const passed = (initDate.getTime() - (initDate.getTimezoneOffset() * 60000)) % 86400000;
    // this.selectedDate = this.maxDate = new Date(initDate.getTime() - passed);
    initDate.setHours(0, 0, 0, 0);
    this.selectedDate = initDate;

    this.maxDate = options.maxDate || new Date();
    this.maxDate.setHours(0, 0, 0, 0);

    this.selectedMonth = new Date(this.selectedDate);
    this.selectedMonth.setDate(1);

    this.maxMonth = new Date(this.maxDate);
    this.maxMonth.setDate(1);

    this.minMonth = new Date(this.minDate);
    this.minMonth.setHours(0, 0, 0, 0);
    this.minMonth.setDate(1);

    if(this.selectedMonth.getTime() === this.minMonth.getTime()) {
      this.prevBtn.setAttribute('disabled', 'true');
    }

    if(this.selectedMonth.getTime() === this.maxMonth.getTime()) {
      this.nextBtn.setAttribute('disabled', 'true');
    }

    if(options.noTitle) {
      this.setTitle = () => {};
    }

    this.setTimeTitle();
    this.setTitle();
    this.setMonth();
  }

  onPrevClick = (e: MouseEvent) => {
    this.selectedMonth.setMonth(this.selectedMonth.getMonth() - 1);
    this.setMonth();

    if(this.selectedMonth.getTime() === this.minMonth.getTime()) {
      this.prevBtn.setAttribute('disabled', 'true');
    }

    this.nextBtn.removeAttribute('disabled');
  };

  onNextClick = (e: MouseEvent) => {
    this.selectedMonth.setMonth(this.selectedMonth.getMonth() + 1);
    this.setMonth();

    if(this.selectedMonth.getTime() === this.maxMonth.getTime()) {
      this.nextBtn.setAttribute('disabled', 'true');
    }

    this.prevBtn.removeAttribute('disabled');
  };

  onDateClick = (e: MouseEvent) => {
    // cancelEvent(e);
    const target = e.target as HTMLElement;

    if(!target.dataset.timestamp) return;

    if(this.selectedEl) {
      if(this.selectedEl === target) return;
      this.selectedEl.classList.remove('active');
    }

    this.selectedEl = target;

    target.classList.add('active');
    const timestamp = +target.dataset.timestamp;

    this.selectedDate = new Date(timestamp);

    this.setTitle();
    this.setTimeTitle();
  };

  public setTimeTitle() {}

  public setTitle() {
    this.title.replaceChildren(new I18n.IntlDateElement({
      date: this.selectedDate,
      options: {
        day: 'numeric',
        month: 'long',
        weekday: 'short'
      }
    }).element);
  }

  private renderElement(disabled: boolean, innerText: string | HTMLElement = '') {
    const el = document.createElement('button');
    el.classList.add('btn-icon', 'date-picker-month-date');

    if(disabled) {
      el.setAttribute('disabled', 'true');
    }

    if(innerText) {
      el.append(innerText);
    }

    return el;
  }

  public setMonth() {
    const firstDate = new Date(this.selectedMonth);

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: this.timeDiv && mediaSizes.isMobile ? 'short' : 'long'
    };

    this.monthTitle.replaceChildren(new I18n.IntlDateElement({date: firstDate, options}).element);

    this.month?.remove();
    this.month = document.createElement('div');
    this.month.classList.add('date-picker-month');

    const weekStartDate = new Date();
    const day = weekStartDate.getDay();
    if(day !== 1) {
      weekStartDate.setHours(-24 * (day - 1));
    }

    for(let i = 0; i < 7; ++i) {
      const el = this.renderElement(true, new I18n.IntlDateElement({date: weekStartDate, options: {weekday: 'narrow'}}).element);
      el.classList.remove('date-picker-month-date');
      el.classList.add('date-picker-month-day');
      this.month.append(el);
      weekStartDate.setDate(weekStartDate.getDate() + 1);
    }

    // 0 - sunday
    let dayIndex = firstDate.getDay() - 1;
    if(dayIndex === -1) dayIndex = 7 - 1;

    const clonedDate = new Date(firstDate.getTime());
    clonedDate.setDate(clonedDate.getDate() - dayIndex - 1);

    // Padding first week
    for(let i = 0; i < dayIndex; ++i) {
      if(this.options.showOverflowMonths) {
        clonedDate.setDate(clonedDate.getDate() + 1);
        this.month.append(this.renderElement(true, '' + clonedDate.getDate()));
      } else {
        this.month.append(this.renderElement(true));
      }
    }

    do {
      const date = firstDate.getDate();
      const el = this.renderElement(firstDate > this.maxDate || firstDate < this.minDate, '' + date);
      el.dataset.timestamp = '' + firstDate.getTime();

      if(firstDate.getTime() === this.selectedDate.getTime()) {
        this.selectedEl = el;
        el.classList.add('active');
      }

      this.month.append(el);

      firstDate.setDate(date + 1);
    } while(firstDate.getDate() !== 1);

    const remainder = this.month.childElementCount % 7;
    if(this.options.showOverflowMonths && remainder) {
      for(let i = remainder; i < 7; ++i) {
        this.month.append(this.renderElement(true, '' + firstDate.getDate()));
        firstDate.setDate(firstDate.getDate() + 1);
      }
    }

    const lines = Math.ceil(this.month.childElementCount / 7);
    this.container.dataset.lines = '' + lines;

    this.monthsContainer.append(this.month);
  }
}
