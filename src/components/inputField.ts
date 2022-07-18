/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from "../helpers/dom/cancelEvent";
import simulateEvent from "../helpers/dom/dispatchEvent";
import documentFragmentToHTML from "../helpers/dom/documentFragmentToHTML";
import findUpAttribute from "../helpers/dom/findUpAttribute";
import getRichValue from "../helpers/dom/getRichValue";
import isInputEmpty from "../helpers/dom/isInputEmpty";
import selectElementContents from "../helpers/dom/selectElementContents";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import { MessageEntity } from "../layer";
import { i18n, LangPackKey, _i18n } from "../lib/langPack";
import mergeEntities from "../lib/richTextProcessor/mergeEntities";
import parseEntities from "../lib/richTextProcessor/parseEntities";
import wrapDraftText from "../lib/richTextProcessor/wrapDraftText";

let init = () => {
  document.addEventListener('paste', (e) => {
    const input = findUpAttribute(e.target, 'contenteditable="true"');
    if(!input) {
      return;
    }

    const noLinebreaks = !!input.dataset.noLinebreaks;
    e.preventDefault();
    let text: string, entities: MessageEntity[];

    // @ts-ignore
    let plainText: string = (e.originalEvent || e).clipboardData.getData('text/plain');
    let usePlainText = true;

    // @ts-ignore
    let html: string = (e.originalEvent || e).clipboardData.getData('text/html');

    const filterEntity = (e: MessageEntity) => e._ === 'messageEntityEmoji' || (e._ === 'messageEntityLinebreak' && !noLinebreaks);
    if(noLinebreaks) {
      const regExp = /[\r\n]/g;
      plainText = plainText.replace(regExp, '');
      html = html.replace(regExp, '');
    }

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
  
        let entities2 = parseEntities(text);
        entities2 = entities2.filter(filterEntity);
        mergeEntities(entities, entities2);
      }
    }
    
    if(usePlainText) {
      text = plainText;
      entities = parseEntities(text);
      entities = entities.filter(filterEntity);
    }

    const fragment = wrapDraftText(text, {entities});
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
  required?: boolean,
  canBeEdited?: boolean,
  validate?: () => boolean,
  inputMode?: 'tel' | 'numeric',
  withLinebreaks?: boolean,
  autocomplete?: string
};

export default class InputField {
  public container: HTMLElement;
  public input: HTMLElement;
  public label: HTMLLabelElement;

  public originalValue: string;

  public required: boolean;
  public validate: () => boolean;

  constructor(public options: InputFieldOptions = {}) {
    this.container = document.createElement('div');
    this.container.classList.add('input-field');

    this.required = options.required;
    this.validate = options.validate;

    if(options.maxLength !== undefined && options.showLengthOn === undefined) {
      options.showLengthOn = Math.min(40, Math.round(options.maxLength / 3));
    }

    const {placeholder, maxLength, showLengthOn, name, plainText, canBeEdited = true, autocomplete} = options;
    const label = options.label || options.labelText;

    const onInputCallbacks: Array<() => void> = [];
    let input: HTMLElement;
    if(!plainText) {
      if(init) {
        init();
      }

      this.container.innerHTML = `
      <div contenteditable="${String(!!canBeEdited)}" class="input-field-input"></div>
      `;

      input = this.container.firstElementChild as HTMLElement;
      // const observer = new MutationObserver(() => {
      //   //checkAndSetRTL(input);

      //   if(processInput) {
      //     processInput();
      //   }
      // });

      onInputCallbacks.push(() => {
        // * because if delete all characters there will br left
        if(isInputEmpty(input)) {
          input.textContent = '';
        }
      });

      // ! childList for paste first symbol
      // observer.observe(input, {characterData: true, childList: true, subtree: true});
    } else {
      this.container.innerHTML = `
      <input type="text" ${name ? `name="${name}"` : ''} autocomplete="${autocomplete ?? 'off'}" ${label ? 'required=""' : ''} class="input-field-input">
      `;

      input = this.container.firstElementChild as HTMLElement;
      //input.addEventListener('input', () => checkAndSetRTL(input));
    }

    input.setAttribute('dir', 'auto');
    
    if(options.inputMode) {
      input.inputMode = options.inputMode;
    }

    if(placeholder) {
      _i18n(input, placeholder, undefined, 'placeholder');
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

    if(maxLength) {
      const labelEl = this.container.lastElementChild as HTMLLabelElement;
      let showingLength = false;

      const onInput = () => {
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

      onInputCallbacks.push(onInput);
    }

    const noLinebreaks = !options.withLinebreaks;
    if(noLinebreaks && !plainText) {
      input.dataset.noLinebreaks = '1';
      input.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') {
          e.preventDefault();
          return false;
        }
      });
    }

    if(onInputCallbacks.length) {
      input.addEventListener('input', () => {
        onInputCallbacks.forEach((callback) => callback());
      });
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

  get value() {
    return this.options.plainText ? (this.input as HTMLInputElement).value : getRichValue(this.input, false).value;
    //return getRichValue(this.input);
  }

  set value(value: string) {
    this.setValueSilently(value, true);

    simulateEvent(this.input, 'input');
  }

  public setValueSilently(value: string, fromSet?: boolean) {
    if(this.options.plainText) {
      (this.input as HTMLInputElement).value = value;
    } else {
      this.input.innerHTML = value;
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

  public setDraftValue(value = '', silent?: boolean) {
    if(!this.options.plainText) {
      value = documentFragmentToHTML(wrapDraftText(value));
    }

    if(silent) {
      this.setValueSilently(value, false); 
    } else {
      this.value = value;
    }
  }

  public setOriginalValue(value: InputField['originalValue'] = '', silent?: boolean) {
    this.originalValue = value;
    this.setDraftValue(value, silent);
  }

  public setState(state: InputState, label?: LangPackKey) {
    if(label) {
      this.label.textContent = '';
      this.label.append(i18n(label, this.options.labelOptions));
    } else {
      this.setLabel();
    }

    this.input.classList.toggle('error', !!(state & InputState.Error));
    this.input.classList.toggle('valid', !!(state & InputState.Valid));
  }

  public setError(label?: LangPackKey) {
    this.setState(InputState.Error, label);
  }
}
