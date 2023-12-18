/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey} from '../lib/langPack';
import ButtonIcon from './buttonIcon';
import Icon from './icon';
import InputField from './inputField';

export default class InputSearch {
  public container: HTMLElement;
  public input: HTMLElement;
  public inputField: InputField;
  public clearBtn: HTMLElement;
  public searchIcon: HTMLElement;

  public prevValue = '';
  public timeout = 0;
  public onChange: (value: string) => void;
  public onClear: () => void;

  constructor(placeholder?: LangPackKey, onChange?: (value: string) => void) {
    this.inputField = new InputField({
      placeholder,
      plainText: true,
      withBorder: true
    });

    this.container = this.inputField.container;
    this.container.classList.remove('input-field');
    this.container.classList.add('input-search');

    this.onChange = onChange;

    this.input = this.inputField.input;
    this.input.classList.add('input-search-input');

    const searchIcon = this.searchIcon = Icon('search', 'input-search-icon', 'input-search-part');

    this.clearBtn = ButtonIcon('close input-search-clear input-search-part');

    this.input.addEventListener('input', this.onInput);
    this.clearBtn.addEventListener('click', this.onClearClick);

    this.container.append(searchIcon, this.clearBtn);
  }

  onInput = () => {
    if(!this.onChange) return;

    const value = this.value;

    if(value !== this.prevValue) {
      this.prevValue = value;
      clearTimeout(this.timeout);
      this.timeout = window.setTimeout(() => {
        this.onChange(value);
      }, 200);
    }
  };

  onClearClick = () => {
    this.value = '';
    this.onChange?.('');
    this.onClear?.();
  };

  get value() {
    return this.inputField.value;
  }

  set value(value: string) {
    this.prevValue = value;
    clearTimeout(this.timeout);
    this.inputField.value = value;
  }

  public remove() {
    clearTimeout(this.timeout);
    this.input.removeEventListener('input', this.onInput);
    this.clearBtn.removeEventListener('click', this.onClearClick);
  }
}
