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
import Icon from './icon';

export default class RadioField {
  public input: HTMLInputElement;
  public label: HTMLLabelElement;
  public main: HTMLElement;
  public lockIcon: HTMLElement;

  constructor(options: {
    text?: string,
    textElement?: HTMLElement | DocumentFragment,
    langKey?: LangPackKey,
    name: string,
    value?: string,
    valueForState?: any,
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

      const getValueForState = () => 'valueForState' in options ? options.valueForState : options.value;

      if(options.stateKey) {
        apiManagerProxy.getState().then((state) => {
          input.checked = getDeepProperty(state, options.stateKey) === getValueForState();
        });

        input.addEventListener('change', () => {
          rootScope.managers.appStateManager.setByKey(options.stateKey, getValueForState());
        });
      }
    }

    const main = this.main = document.createElement('div');
    main.classList.add('radio-field-main');

    if(options.textElement) {
      main.append(options.textElement);
    } else if(options.text) {
      main.textContent = options.text;
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

  get locked() {
    return !!this.lockIcon;
  }

  set locked(locked: boolean) {
    if(!locked) {
      this.lockIcon?.remove();
      this.lockIcon = undefined;
      this.main.classList.remove('is-locked');
      return;
    }

    if(this.lockIcon) {
      return;
    }

    this.main.prepend(this.lockIcon = Icon('premium_lock', 'radio-field-lock'));
    this.main.classList.add('is-locked');
  }

  public setValueSilently(checked: boolean) {
    this.input.checked = checked;
  }
}
