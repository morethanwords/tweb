/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {USING_BOMS} from '../helpers/dom/richInputHandler';
import BOM from '../helpers/string/bom';
import {_i18n} from '../lib/langPack';
import InputField, {InputFieldOptions} from './inputField';
import SetTransition from './singleTransition';

const USELESS_REG_EXP = new RegExp(`(<span>${BOM}</span>)|(<br\/?>)`, 'g');

export default class InputFieldAnimated extends InputField {
  public inputFake: HTMLElement;
  public onChangeHeight: (height: number) => void;

  // public onLengthChange: (length: number, isOverflow: boolean) => void;
  // protected wasInputFakeClientHeight: number;
  // protected showScrollDebounced: () => void;

  constructor(options?: InputFieldOptions) {
    super(options);

    this.input.addEventListener('input', () => {
      this.updateInnerHTML();
      this.onFakeInput();
    });

    // if(options.placeholder) {
    //   _i18n(this.inputFake, options.placeholder, undefined, 'placeholder');
    // }

    this.input.classList.add('scrollable', 'scrollable-y', 'no-scrollbar');
    // this.wasInputFakeClientHeight = 0;
    // this.showScrollDebounced = debounce(() => this.input.classList.remove('no-scrollbar'), 150, false, true);
    this.inputFake = document.createElement('div');
    // this.inputFake.contentEditable = 'true';
    this.inputFake.contentEditable = 'true';
    this.inputFake.tabIndex = -1;
    this.inputFake.className = this.input.className + ' input-field-input-fake';
  }

  public onFakeInput(setHeight = true, noAnimation?: boolean) {
    const {scrollHeight: newHeight/* , clientHeight */} = this.inputFake;
    /* if(this.wasInputFakeClientHeight && this.wasInputFakeClientHeight !== clientHeight) {
      this.input.classList.add('no-scrollbar'); // ! в сафари может вообще не появиться скролл после анимации, так как ему нужен полный reflow блока с overflow.
      this.showScrollDebounced();
    } */

    noAnimation ??= !this.input.isContentEditable;

    const currentHeight = +this.input.style.height.replace('px', '');
    if(currentHeight === newHeight) {
      return;
    }

    const TRANSITION_DURATION_FACTOR = 50;
    const transitionDuration = noAnimation ? 0 : Math.round(
      TRANSITION_DURATION_FACTOR * Math.log(Math.abs(newHeight - currentHeight))
    );

    // this.wasInputFakeClientHeight = clientHeight;
    this.input.style.transitionDuration = `${transitionDuration}ms`;

    if(setHeight) {
      this.onChangeHeight?.(newHeight);
      this.input.style.height = newHeight ? newHeight + 'px' : '';
      (this.input as any).oldHeight = (this.input as any).newHeight;
      (this.input as any).newHeight = newHeight;

      Array.from(this.input.querySelectorAll('.quote-like')).forEach((element) => {
        const scrollHeight = element.scrollHeight;
        const computedStyle = getComputedStyle(element);
        const lineHeight = parseFloat(computedStyle.lineHeight);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const lines = (scrollHeight - paddingTop - paddingBottom) / lineHeight;
        element.classList.toggle('can-send-collapsed', lines > 3);
      });
    }

    const className = 'is-changing-height';
    SetTransition({
      element: this.input,
      className,
      forwards: true,
      duration: transitionDuration,
      onTransitionEnd: () => {
        this.input.classList.remove(className);
        (this.input as any).oldHeight = (this.input as any).newHeight;
      }
    });
  }

  protected updateInnerHTML(innerHTML = this.input.innerHTML) {
    innerHTML = innerHTML
    .replace(/<custom-emoji-renderer-element.+\/custom-emoji-renderer-element>/, '')
    .replace(/(<custom-emoji-element.+?>).+?\/custom-emoji-element>/g, '$1</custom-emoji-element>');

    if(USING_BOMS) {
      innerHTML = innerHTML.replace(USELESS_REG_EXP, '');
    }

    this.inputFake.innerHTML = innerHTML;
  }

  public setValueSilently(value: Parameters<InputField['setValueSilently']>[0], fromSet?: boolean) {
    super.setValueSilently(value, fromSet);

    this.updateInnerHTML();
    if(!fromSet) {
      this.onFakeInput();
    }
  }
}
