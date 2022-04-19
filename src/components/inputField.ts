/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import simulateEvent from "../helpers/dom/dispatchEvent";
import documentFragmentToHTML from "../helpers/dom/documentFragmentToHTML";
import findUpAttribute from "../helpers/dom/findUpAttribute";
import getRichValue from "../helpers/dom/getRichValue";
import isInputEmpty from "../helpers/dom/isInputEmpty";
import selectElementContents from "../helpers/dom/selectElementContents";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import { MessageEntity } from "../layer";
import { i18n, LangPackKey, _i18n } from "../lib/langPack";
import RichTextProcessor from "../lib/richtextprocessor";
import SetTransition from "./singleTransition";

let init = () => {
  document.addEventListener('paste', (e) => {
    if(!findUpAttribute(e.target, 'contenteditable="true"')) {
      return;
    }

    e.preventDefault();
    let text: string, entities: MessageEntity[];

    // @ts-ignore
    let plainText: string = (e.originalEvent || e).clipboardData.getData('text/plain');
    let usePlainText = true;

    // @ts-ignore
    let html: string = (e.originalEvent || e).clipboardData.getData('text/html');
    if(html.trim()) {
      html = html.replace(/<style([\s\S]*)<\/style>/, '');
      html = html.replace(/<!--([\s\S]*)-->/, '');

      const match = html.match(/<body>([\s\S]*)<\/body>/);
      if(match) {
        html = match[1].trim();
      }

      let span: HTMLElement = document.createElement('span');
      span.innerHTML = html;

      let curChild = span.firstChild;
      while(curChild) { // * fix whitespace between elements like <p>asd</p>\n<p>zxc</p>
        let nextSibling = curChild.nextSibling;
        if(curChild.nodeType === 3) {
          if(!curChild.nodeValue.trim()) {
            curChild.remove();
          }
        }

        curChild = nextSibling;
      }

      const richValue = getRichValue(span, true);
      if(richValue.value.replace(/\s/g, '').length === plainText.replace(/\s/g, '').length) {
        text = richValue.value;
        entities = richValue.entities;
        usePlainText = false;
  
        let entities2 = RichTextProcessor.parseEntities(text);
        entities2 = entities2.filter(e => e._ === 'messageEntityEmoji' || e._ === 'messageEntityLinebreak');
        RichTextProcessor.mergeEntities(entities, entities2);
      }
    }
    
    if(usePlainText) {
      text = plainText;
      entities = RichTextProcessor.parseEntities(text);
      entities = entities.filter(e => e._ === 'messageEntityEmoji' || e._ === 'messageEntityLinebreak');
    }

    const fragment = RichTextProcessor.wrapDraftText(text, {entities});
    text = documentFragmentToHTML(fragment);
    
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
  labelText?: string | DocumentFragment,
  name?: string, 
  maxLength?: number, 
  showLengthOn?: number,
  plainText?: true,
  animate?: boolean,
  required?: boolean,
  canBeEdited?: boolean,
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
  // protected wasInputFakeClientHeight: number;
  // protected showScrollDebounced: () => void;

  constructor(public options: InputFieldOptions = {}) {
    this.container = document.createElement('div');
    this.container.classList.add('input-field');

    this.required = options.required;
    this.validate = options.validate;

    if(options.maxLength !== undefined && options.showLengthOn === undefined) {
      options.showLengthOn = Math.min(40, Math.round(options.maxLength / 3));
    }

    const {placeholder, maxLength, showLengthOn, name, plainText, canBeEdited = true} = options;

    let label = options.label || options.labelText;

    let input: HTMLElement;
    if(!plainText) {
      if(init) {
        init();
      }

      this.container.innerHTML = `
      <div contenteditable="${String(!!canBeEdited)}" class="input-field-input"></div>
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
        // this.wasInputFakeClientHeight = 0;
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
    if(!this.value) { // * avoid selecting whole empty field on iOS devices
      return;
    }

    if(this.options.plainText) {
      (this.input as HTMLInputElement).select(); // * select text
    } else {
      selectElementContents(this.input);
    }
  }

  public setLabel() {
    this.label.textContent = '';
    if(this.options.labelText) {
      setInnerHTML(this.label, this.options.labelText);
    } else {
      this.label.append(i18n(this.options.label, this.options.labelOptions));
    }
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
    return !this.input.classList.contains('error') && 
      (!this.validate || this.validate()) && 
      (!this.required || !isInputEmpty(this.input));
  }

  public isValidToChange() {
    return this.isValid() && this.isChanged();
  }

  public setDraftValue(value = '', silent = false) {
    if(!this.options.plainText) {
      value = documentFragmentToHTML(RichTextProcessor.wrapDraftText(value));
    }

    if(silent) {
      this.setValueSilently(value, false); 
    } else {
      this.value = value;
    }
  }

  public setOriginalValue(value: InputField['originalValue'] = '', silent = false) {
    this.originalValue = value;
    this.setDraftValue(value, silent);
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
