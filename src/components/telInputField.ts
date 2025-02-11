/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import placeCaretAtEnd from '../helpers/dom/placeCaretAtEnd';
import {formatPhoneNumber} from '../helpers/formatPhoneNumber';
import {IS_APPLE, IS_ANDROID, IS_APPLE_MOBILE} from '../environment/userAgent';
import {HelpCountry, HelpCountryCode} from '../layer';
import InputField, {InputFieldOptions} from './inputField';

export default class TelInputField extends InputField {
  private pasted = false;
  public lastValue = '';

  constructor(options: InputFieldOptions & {
    onInput?: (formatted: ReturnType<typeof formatPhoneNumber>) => void
  } = {}) {
    super({
      label: 'Contacts.PhoneNumber.Placeholder',
      // plainText: true,
      name: 'phone',
      ...options
    });

    this.container.classList.add('input-field-phone');

    const telEl = this.input;
    if(telEl instanceof HTMLInputElement) {
      telEl.type = 'tel';
      telEl.autocomplete = 'rr55RandomRR55' as any;
    } else {
      telEl.inputMode = 'decimal';

      const pixelRatio = window.devicePixelRatio;
      if(pixelRatio > 1) {
        let letterSpacing: number;
        if(IS_APPLE) {
          letterSpacing = pixelRatio * -.16;
        } else if(IS_ANDROID) {
          letterSpacing = 0;
        }

        telEl.style.setProperty('--letter-spacing', letterSpacing + 'px');
      }

      const originalFunc = this.setValueSilently.bind(this);
      this.setValueSilently = (value) => {
        originalFunc(value);
        placeCaretAtEnd(this.input, true);
      };
    }

    telEl.addEventListener('input', () => {
      // console.log('input', this.value);
      telEl.classList.remove('error');

      const value = this.value;
      const diff = Math.abs(value.length - this.lastValue.length);
      if(diff > 1 && !this.pasted && IS_APPLE_MOBILE) {
        this.setValueSilently(this.lastValue + value);
      }

      this.pasted = false;

      this.setLabel();

      let formattedPhoneNumber: ReturnType<typeof formatPhoneNumber>;
      let formatted: string, country: HelpCountry, countryCode: HelpCountryCode, leftPattern = '';
      if(this.value.replace(/\++/, '+') === '+') {
        this.setValueSilently('+');
      } else {
        formattedPhoneNumber = formatPhoneNumber(this.value);
        formatted = formattedPhoneNumber.formatted;
        country = formattedPhoneNumber.country;
        leftPattern = formattedPhoneNumber.leftPattern;
        countryCode = formattedPhoneNumber.code;
        this.setValueSilently(this.lastValue = formatted ? '+' + formatted : '');
      }

      telEl.dataset.leftPattern = leftPattern/* .replace(/X/g, '0') */;

      // console.log(formatted, country);

      options.onInput && options.onInput(formattedPhoneNumber);
    });

    telEl.addEventListener('paste', () => {
      this.pasted = true;
      // console.log('paste', telEl.value);
    });

    /* telEl.addEventListener('change', (e) => {
      console.log('change', telEl.value);
    }); */

    telEl.addEventListener('keypress', (e) => {
      // console.log('keypress', this.value);
      const key = e.key;
      if(/\D/.test(key) && !(e.metaKey || e.ctrlKey) && key !== 'Backspace' && !(key === '+' && e.shiftKey/*  && !this.value */)) {
        e.preventDefault();
        return false;
      }
    });

    /* telEl.addEventListener('focus', function(this: typeof telEl, e) {
      this.removeAttribute('readonly'); // fix autocomplete
    });*/
  }
}
