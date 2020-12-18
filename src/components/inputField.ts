import { getRichValue } from "../helpers/dom";
import { checkRTL } from "../helpers/string";
import RichTextProcessor from "../lib/richtextprocessor";

let init = () => {
  document.addEventListener('paste', (e) => {
    if(!(e.target as HTMLElement).hasAttribute('contenteditable') && !(e.target as HTMLElement).parentElement.hasAttribute('contenteditable')) {
      return;
    }
    //console.log('document paste');

    //console.log('messageInput paste');

    e.preventDefault();
    // @ts-ignore
    let text = (e.originalEvent || e).clipboardData.getData('text/plain');

    let entities = RichTextProcessor.parseEntities(text);
    //console.log('messageInput paste', text, entities);
    entities = entities.filter(e => e._ == 'messageEntityEmoji' || e._ == 'messageEntityLinebreak');
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

const checkAndSetRTL = (input: HTMLElement) => {
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
};

class InputField {
  public container: HTMLElement;
  public input: HTMLElement;

  constructor(private options: {
    placeholder?: string, 
    label?: string, 
    name?: string, 
    maxLength?: number, 
    showLengthOn?: number,
    plainText?: true
  } = {}) {
    this.container = document.createElement('div');
    this.container.classList.add('input-field');

    if(options.maxLength) {
      options.showLengthOn = Math.round(options.maxLength / 3);
    }

    const {placeholder, label, maxLength, showLengthOn, name, plainText} = options;

    let input: HTMLElement;
    if(!plainText) {
      if(init) {
        init();
      }

      this.container.innerHTML = `
      <div ${placeholder ? `data-placeholder="${placeholder}"` : ''} contenteditable="true" class="input-field-input"></div>
      ${label ? `<label>${label}</label>` : ''}
      `;

      input = this.container.firstElementChild as HTMLElement;
      const observer = new MutationObserver(() => {
        checkAndSetRTL(input);

        if(processInput) {
          processInput();
        }
      });
      
      // ! childList for paste first symbol
      observer.observe(input, {characterData: true, childList: true, subtree: true});
    } else {
      this.container.innerHTML = `
      <input type="text" ${name ? `name="${name}"` : ''} ${placeholder ? `placeholder="${placeholder}"` : ''} autocomplete="off" ${label ? 'required=""' : ''} class="input-field-input">
      ${label ? `<label>${label}</label>` : ''}
      `;

      input = this.container.firstElementChild as HTMLElement;
      input.addEventListener('input', () => checkAndSetRTL(input));
    }

    let processInput: () => void;
    if(maxLength) {
      const labelEl = this.container.lastElementChild as HTMLLabelElement;
      let showingLength = false;

      processInput = () => {
        const wasError = input.classList.contains('error');
        // * https://stackoverflow.com/a/54369605 #2 to count emoji as 1 symbol
        const inputLength = plainText ? (input as HTMLInputElement).value.length : [...getRichValue(input)].length;
        const diff = maxLength - inputLength;
        const isError = diff < 0;
        input.classList.toggle('error', isError);

        if(isError || diff <= showLengthOn) {
          labelEl.innerText = label + ` (${maxLength - inputLength})`;
          if(!showingLength) showingLength = true;
        } else if((wasError && !isError) || showingLength) {
          labelEl.innerText = label;
          showingLength = false;
        }
      };

      input.addEventListener('input', processInput);
    }

    this.input = input;
  }

  get value() {
    return this.options.plainText ? (this.input as HTMLInputElement).value : getRichValue(this.input);
    //return getRichValue(this.input);
  }

  set value(value: string) {
    this.setValueSilently(value);

    const event = new Event('input', {bubbles: true, cancelable: true});
    this.input.dispatchEvent(event);
  }

  public setValueSilently(value: string) {
    if(this.options.plainText) {
      (this.input as HTMLInputElement).value = value;
    } else {
      this.input.innerHTML = value;
    }
  }
}

export default InputField;