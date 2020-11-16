import { getRichValue, isInputEmpty } from "../helpers/dom";
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
    text = RichTextProcessor.wrapRichText(text, {entities, noLinks: true});

    // console.log('messageInput paste after', text);

    // @ts-ignore
    //let html = (e.originalEvent || e).clipboardData.getData('text/html');

    // @ts-ignore
    //console.log('paste text', text, );
    window.document.execCommand('insertHTML', false, text);
  });

  init = null;
};

const InputField = (options: {
  placeholder?: string, 
  label?: string, 
  name: string, 
  maxLength?: number, 
  showLengthOn?: number,
  plainText?: true
}) => {
  const div = document.createElement('div');
  div.classList.add('input-field');

  if(options.maxLength) {
    options.showLengthOn = Math.round(options.maxLength / 3);
  }

  const {placeholder, label, maxLength, showLengthOn, name, plainText} = options;

  if(!plainText) {
    if(init) {
      init();
    }

    div.innerHTML = `
    <div id="input-${name}" ${placeholder ? `data-placeholder="${placeholder}"` : ''} contenteditable="true" class="input-field-input"></div>
    ${label ? `<label for="input-${name}">${label}</label>` : ''}
    `;

    const input = div.firstElementChild as HTMLElement;
    const observer = new MutationObserver((mutationsList, observer) => {
      const isEmpty = isInputEmpty(input);
      //console.log('input', isEmpty);

      const char = input.innerText[0];
      let direction = 'ltr';
      if(char && checkRTL(char)) {
        direction = 'rtl';
      }

      input.style.direction = direction;

      if(processInput) {
        processInput();
      }
    });
    
    // ! childList for paste first symbol
    observer.observe(input, {characterData: true, childList: true, subtree: true});
  } else {
    div.innerHTML = `
    <input type="text" name="${name}" id="input-${name}" ${placeholder ? `placeholder="${placeholder}"` : ''} autocomplete="off" required="" class="input-field-input">
    ${label ? `<label for="input-${name}">${label}</label>` : ''}
    `;
  }

  let processInput: () => void;
  if(maxLength) {
    const input = div.firstElementChild as HTMLInputElement;
    const labelEl = div.lastElementChild as HTMLLabelElement;
    let showingLength = false;

    processInput = () => {
      const wasError = input.classList.contains('error');
      // * https://stackoverflow.com/a/54369605 #2 to count emoji as 1 symbol
      const inputLength = plainText ? input.value.length : [...getRichValue(input)].length;
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

  return {container: div, input: div.firstElementChild as HTMLInputElement};
};

export default InputField;