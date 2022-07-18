/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { _i18n } from "../lib/langPack";
import InputField, { InputFieldOptions } from "./inputField";
import SetTransition from "./singleTransition";

export default class InputFieldAnimated extends InputField {
  public inputFake: HTMLElement;

  //public onLengthChange: (length: number, isOverflow: boolean) => void;
  // protected wasInputFakeClientHeight: number;
  // protected showScrollDebounced: () => void;

  constructor(options?: InputFieldOptions) {
    super(options);

    this.input.addEventListener('input', () => {
      this.inputFake.innerHTML = this.input.innerHTML;
      this.onFakeInput();
    });

    if(options.placeholder) {
      _i18n(this.inputFake, options.placeholder, undefined, 'placeholder');
    }

    this.input.classList.add('scrollable', 'scrollable-y');
    // this.wasInputFakeClientHeight = 0;
    // this.showScrollDebounced = debounce(() => this.input.classList.remove('no-scrollbar'), 150, false, true);
    this.inputFake = document.createElement('div');
    this.inputFake.setAttribute('contenteditable', 'true');
    this.inputFake.className = this.input.className + ' input-field-input-fake';
  }

  public onFakeInput(setHeight = true) {
    const {scrollHeight: newHeight/* , clientHeight */} = this.inputFake;
    /* if(this.wasInputFakeClientHeight && this.wasInputFakeClientHeight !== clientHeight) {
      this.input.classList.add('no-scrollbar'); // ! в сафари может вообще не появиться скролл после анимации, так как ему нужен полный reflow блока с overflow.
      this.showScrollDebounced();
    } */

    const currentHeight = +this.input.style.height.replace('px', '');
    if(currentHeight === newHeight) {
      return;
    }

    const TRANSITION_DURATION_FACTOR = 50;
    const transitionDuration = Math.round(
      TRANSITION_DURATION_FACTOR * Math.log(Math.abs(newHeight - currentHeight)),
    );

    // this.wasInputFakeClientHeight = clientHeight;
    this.input.style.transitionDuration = `${transitionDuration}ms`;

    if(setHeight) {
      this.input.style.height = newHeight ? newHeight + 'px' : '';
    }

    const className = 'is-changing-height';
    SetTransition(this.input, className, true, transitionDuration, () => {
      this.input.classList.remove(className);
    });
  }

  public setValueSilently(value: string, fromSet?: boolean) {
    super.setValueSilently(value, fromSet);

    this.inputFake.innerHTML = value;
    if(!fromSet) {
      this.onFakeInput();
    }
  }
}
