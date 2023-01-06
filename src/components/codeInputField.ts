/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import InputField, {InputFieldOptions} from './inputField';

export default class CodeInputField extends InputField {
  constructor(public options: InputFieldOptions & {
    length: number,
    onFill: (code: string) => void
  }) {
    super(Object.assign(options, {
      plainText: true
    }));

    const input = this.input as HTMLInputElement;
    input.type = 'tel';
    input.setAttribute('required', '');
    input.autocomplete = 'off';

    let lastLength = 0;
    this.input.addEventListener('input', (e) => {
      this.input.classList.remove('error');
      this.setLabel();

      const value = this.value.replace(/\D/g, '').slice(0, options.length);
      this.setValueSilently(value);

      const length = this.value.length;
      if(length === options.length) { // submit code
        options.onFill(this.value);
      } else if(length === lastLength) {
        return;
      }

      lastLength = length;
    });
  }
}
