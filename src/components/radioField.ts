/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import simulateEvent from '../helpers/dom/dispatchEvent';
import getDeepProperty from '../helpers/object/getDeepProperty';
import {LangPackKey, _i18n} from '../lib/langPack';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import rootScope from '../lib/rootScope';

export default class RadioField {
  public input: HTMLInputElement;
  public label: HTMLLabelElement;
  public main: HTMLElement;

  constructor(options: {
    text?: string,
    langKey?: LangPackKey,
    name: string,
    value?: string,
    stateKey?: string,
    alignRight?: boolean
  }) {
    const label = this.label = document.createElement('label');
    label.classList.add('radio-field');

    if(options.alignRight) {
      label.classList.add('radio-field-right');
    }

    const input = this.input = document.createElement('input');
    input.type = 'radio';
    /* input.id =  */input.name = 'input-radio-' + options.name;

    if(options.value) {
      input.value = options.value;

      if(options.stateKey) {
        apiManagerProxy.getState().then((state) => {
          input.checked = getDeepProperty(state, options.stateKey) === options.value;
        });

        input.addEventListener('change', () => {
          rootScope.managers.appStateManager.setByKey(options.stateKey, options.value);
        });
      }
    }

    const main = this.main = document.createElement('div');
    main.classList.add('radio-field-main');

    if(options.text) {
      main.innerHTML = options.text;
      /* const caption = document.createElement('div');
      caption.classList.add('radio-field-main-caption');
      caption.innerHTML = text;

      if(subtitle) {
        label.classList.add('radio-field-with-subtitle');
        caption.insertAdjacentHTML('beforeend', `<div class="radio-field-main-subtitle">${subtitle}</div>`);
      }

      main.append(caption); */
    } else if(options.langKey) {
      _i18n(main, options.langKey);
    }

    label.append(input, main);
  }

  get checked() {
    return this.input.checked;
  }

  set checked(checked: boolean) {
    this.setValueSilently(checked);
    simulateEvent(this.input, 'change');
  }

  public setValueSilently(checked: boolean) {
    this.input.checked = checked;
  }
};
