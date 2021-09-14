/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import simulateEvent from "../helpers/dom/dispatchEvent";
import findUpAttribute from "../helpers/dom/findUpAttribute";
import getRichValue from "../helpers/dom/getRichValue";
import isInputEmpty from "../helpers/dom/isInputEmpty";
import { i18n, LangPackKey, _i18n } from "../lib/langPack";
import RichTextProcessor from "../lib/richtextprocessor";

let init = () => {
  document.addEventListener('paste', (e) => {
    if(!findUpAttribute(e.target, 'contenteditable="true"')) {
      return;
    }
    //console.log('document paste');

    //console.log('messageInput paste');

    e.preventDefault();
    // @ts-ignore
    let text = (e.originalEvent || e).clipboardData.getData('text/plain');

    let entities = RichTextProcessor.parseEntities(text);
    //console.log('messageInput paste', text, entities);
    entities = entities.filter(e => e._ === 'messageEntityEmoji' || e._ === 'messageEntityLinebreak');
    //text = RichTextProcessor.wrapEmojiText(text);
    text = RichTextProcessor.wrapRichText(text, {entities, noLinks: true, wrappingDraft: true});

    // console.log('messageInput paste after', text);

    // @ts-ignore
    //let html = (e.originalEvent || e).clipboardData.getData('text/html');

    // @ts-ignore
    //console.log('paste text', text, );
    window.document.execCommand('insertHTML', false, text);
  });

  init = null;
};

// ! it doesn't respect symbols other than strongs
/* const checkAndSetRTL = (input: HTMLElement) => {
  //const isEmpty = isInputEmpty(input);
  //console.log('input', isEmpty);

  //const char = [...getRichValue(input)][0];
  const char = (input instanceof HTMLInputElement ? input.value : input.innerText)[0];
  let direction = 'ltr';
  if(char && checkRTL(char)) {
    direction = 'rtl';
  }

  //console.log('RTL', direction, char);

  input.style.direction = direction;
}; */

export enum InputState {
  Neutral = 0,
  Valid = 1,
  Error = 2
};

export type InputFieldOptions = {
  placeholder?: LangPackKey, 
  label?: LangPackKey, 
  labelOptions?: any[],
  labelText?: string,
  name?: string, 
  maxLength?: number, 
  showLengthOn?: number,
  plainText?: true,
  animate?: true,
  required?: boolean,
  validate?: () => boolean
};

class InputField {
  public container: HTMLElement;
  public input: HTMLElement;
  public inputFake: HTMLElement;
  public label: HTMLLabelElement;

  public originalValue: string;

  public required: boolean;
  public validate: () => boolean;

  //public onLengthChange: (length: number, isOverflow: boolean) => void;
  protected wasInputFakeClientHeight: number;
  // protected showScrollDebounced: () => void;

  constructor(public options: InputFieldOptions = {}) {
    this.container = document.createElement('div');
    this.container.classList.add('input-field');

    this.required = options.required;
    this.validate = options.validate;

    if(this.required) {
      this.originalValue = '';
    }

    if(options.maxLength) {
      options.showLengthOn = Math.min(40, Math.round(options.maxLength / 3));
    }

    const {placeholder, maxLength, showLengthOn, name, plainText} = options;

    let label = options.label || options.labelText;

    let input: HTMLElement;
    if(!plainText) {
      if(init) {
        init();
      }

      this.container.innerHTML = `
      <div contenteditable="true" class="input-field-input"></div>
      `;

      input = this.container.firstElementChild as HTMLElement;
      const observer = new MutationObserver(() => {
        //checkAndSetRTL(input);

        if(processInput) {
          processInput();
        }
      });

      // * because if delete all characters there will br left
      input.addEventListener('input', () => {
        if(isInputEmpty(input)) {
          input.innerHTML = '';
        }

        if(this.inputFake) {
          this.inputFake.innerHTML = input.innerHTML;
          this.onFakeInput();
        }
      });
      
      // ! childList for paste first symbol
      observer.observe(input, {characterData: true, childList: true, subtree: true});

      if(options.animate) {
        input.classList.add('scrollable', 'scrollable-y');
        this.wasInputFakeClientHeight = 0;
        // this.showScrollDebounced = debounce(() => this.input.classList.remove('no-scrollbar'), 150, false, true);
        this.inputFake = document.createElement('div');
        this.inputFake.setAttribute('contenteditable', 'true');
        this.inputFake.className = input.className + ' input-field-input-fake';
      }
    } else {
      this.container.innerHTML = `
      <input type="text" ${name ? `name="${name}"` : ''} autocomplete="off" ${label ? 'required=""' : ''} class="input-field-input">
      `;

      input = this.container.firstElementChild as HTMLElement;
      //input.addEventListener('input', () => checkAndSetRTL(input));
    }

    input.setAttribute('dir', 'auto');

    if(placeholder) {
      _i18n(input, placeholder, undefined, 'placeholder');

      if(this.inputFake) {
        _i18n(this.inputFake, placeholder, undefined, 'placeholder');
      }
    }

    if(label || placeholder) {
      const border = document.createElement('div');
      border.classList.add('input-field-border');
      this.container.append(border);
    }

    if(label) {
      this.label = document.createElement('label');
      this.setLabel();
      this.container.append(this.label);
    }

    let processInput: () => void;
    if(maxLength) {
      const labelEl = this.container.lastElementChild as HTMLLabelElement;
      let showingLength = false;

      processInput = () => {
        const wasError = input.classList.contains('error');
        // * https://stackoverflow.com/a/54369605 #2 to count emoji as 1 symbol
        const inputLength = plainText ? (input as HTMLInputElement).value.length : [...getRichValue(input, false).value].length;
        const diff = maxLength - inputLength;
        const isError = diff < 0;
        input.classList.toggle('error', isError);

        //this.onLengthChange && this.onLengthChange(inputLength, isError);

        if(isError || diff <= showLengthOn) {
          this.setLabel();
          labelEl.append(` (${maxLength - inputLength})`);
          if(!showingLength) showingLength = true;
        } else if((wasError && !isError) || showingLength) {
          this.setLabel();
          showingLength = false;
        }
      };

      input.addEventListener('input', processInput);
    }

    this.input = input;
  }

  public select() {
    if((this.input as HTMLInputElement).value) { // * avoid selecting whole empty field on iOS devices
      (this.input as HTMLInputElement).select(); // * select text
    }
  }

  public setLabel() {
    this.label.textContent = '';
    if(this.options.labelText) {
      this.label.innerHTML = this.options.labelText;
    } else {
      this.label.append(i18n(this.options.label, this.options.labelOptions));
    }
  }

  public onFakeInput() {
    const {scrollHeight, clientHeight} = this.inputFake;
    /* if(this.wasInputFakeClientHeight && this.wasInputFakeClientHeight !== clientHeight) {
      this.input.classList.add('no-scrollbar'); // ! в сафари может вообще не появиться скролл после анимации, так как ему нужен полный reflow блока с overflow.
      this.showScrollDebounced();
    } */

    this.wasInputFakeClientHeight = clientHeight;
    this.input.style.height = scrollHeight ? scrollHeight + 'px' : '';
  }

  get value() {
    return this.options.plainText ? (this.input as HTMLInputElement).value : getRichValue(this.input, false).value;
    //return getRichValue(this.input);
  }

  set value(value: string) {
    this.setValueSilently(value, false);

    simulateEvent(this.input, 'input');
  }

  public setValueSilently(value: string, fireFakeInput = true) {
    if(this.options.plainText) {
      (this.input as HTMLInputElement).value = value;
    } else {
      this.input.innerHTML = value;
      
      if(this.inputFake) {
        this.inputFake.innerHTML = value;

        if(fireFakeInput) {
          this.onFakeInput();
        }
      }
    }
  }

  public isChanged() {
    return this.value !== this.originalValue;
  }

  public isValid() {
    return !this.input.classList.contains('error') && this.isChanged() && (!this.validate || this.validate());
  }

  public setOriginalValue(value: InputField['originalValue'] = '', silent = false) {
    this.originalValue = value;

    if(!this.options.plainText) {
      value = RichTextProcessor.wrapDraftText(value);
    }

    if(silent) {
      this.setValueSilently(value, false); 
    } else {
      this.value = value;
    }
  }

  public setState(state: InputState, label?: LangPackKey) {
    if(label) {
      this.label.textContent = '';
      this.label.append(i18n(label, this.options.labelOptions));
    }

    this.input.classList.toggle('error', !!(state & InputState.Error));
    this.input.classList.toggle('valid', !!(state & InputState.Valid));
  }

  public setError(label?: LangPackKey) {
    this.setState(InputState.Error, label);
  }
}

export default InputField;
