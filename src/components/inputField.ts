/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type CustomEmojiElement from '../lib/customEmoji/element';
import type {AnimationItemGroup} from './animationIntersector';
import {CustomEmojiRendererElement} from '../lib/customEmoji/renderer';
import cancelEvent from '../helpers/dom/cancelEvent';
import simulateEvent from '../helpers/dom/dispatchEvent';
import documentFragmentToHTML from '../helpers/dom/documentFragmentToHTML';
import findUpAttribute from '../helpers/dom/findUpAttribute';
import findUpTag from '../helpers/dom/findUpTag';
import getCaretPosNew from '../helpers/dom/getCaretPosNew';
import getRichValueWithCaret from '../helpers/dom/getRichValueWithCaret';
import isInputEmpty from '../helpers/dom/isInputEmpty';
import replaceContent from '../helpers/dom/replaceContent';
import RichInputHandler, {USING_BOMS} from '../helpers/dom/richInputHandler';
import selectElementContents from '../helpers/dom/selectElementContents';
import setInnerHTML, {setDirection} from '../helpers/dom/setInnerHTML';
import {MessageEntity} from '../layer';
import {i18n, LangPackKey, _i18n} from '../lib/langPack';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import mergeEntities from '../lib/richTextProcessor/mergeEntities';
import parseEntities from '../lib/richTextProcessor/parseEntities';
import wrapDraftText from '../lib/richTextProcessor/wrapDraftText';
import {createCustomFiller, insertCustomFillers} from '../lib/richTextProcessor/wrapRichText';
import type {MarkupTooltipTypes} from './chat/markupTooltip';
import forEachReverse from '../helpers/array/forEachReverse';

export async function insertRichTextAsHTML(input: HTMLElement, text: string, entities: MessageEntity[], wrappingForPeerId?: PeerId) {
  const loadPromises: Promise<any>[] = [];
  const wrappingCustomEmoji = entities?.some((entity) => entity._ === 'messageEntityCustomEmoji');
  const renderer = wrappingCustomEmoji ? createCustomEmojiRendererForInput() : undefined;
  const fragment = wrapDraftText(text, {entities, wrappingForPeerId, loadPromises, customEmojiRenderer: renderer});
  const something = fragment.querySelectorAll<HTMLElement>('[contenteditable="false"]');
  something.forEach((el) => {
    el.contentEditable = 'inherit';
    el.classList.add('pc');
  });

  loadPromises.length && await Promise.all(loadPromises);

  fragment.querySelectorAll<HTMLElement>('.input-selectable').forEach((el) => {
    el.prepend(createCustomFiller(true));
  });

  const richInputHandler = USING_BOMS ? RichInputHandler.getInstance() : undefined;
  // const restore = richInputHandler.prepareApplyingMarkdown();

  // fragment.querySelectorAll('.input-filler').forEach((el) => el.remove());

  // const fillers = Array.from(input.querySelectorAll<HTMLElement>('.input-filler')).map((el) => {
  //   el.contentEditable = 'false';
  //   return el;
  // });

  const customEmojiElements = Array.from(fragment.querySelectorAll<HTMLImageElement>('.custom-emoji-placeholder')).map((el) => {
    el.dataset.ces = '1';
    return (el as any).customEmojiElement as CustomEmojiElement;
  });

  const html = documentFragmentToHTML(fragment);
  renderer?.destroy();

  // console.log(html);

  const pre = getCaretPosNew(input);
  // console.log('pre', pre);
  let textNode: ChildNode, textNodeValue: string;
  if(pre.node) {
    // if(pre.node?.nodeValue === BOM && false) {
    //   textNode = document.createTextNode(textNodeValue = BOM);
    //   (pre.node.parentNode as any as ChildNode).after(textNode);
    //   pre.selection.modify('extend', 'forward', 'character');
    //   pre.selection.collapseToEnd();
    // }
  } else {
    const range = document.createRange();
    let node = input.lastChild;
    if(!node) {
      input.append(node /* = textNode */ = document.createTextNode(''));
    }

    range.setStartAfter(node);
    range.collapse(true);
    pre.selection.removeAllRanges();
    pre.selection.addRange(range);
  }

  // const fragmentLastChild = fragment.lastChild;

  // const s = document.createElement('span');
  // (node as ChildNode).replaceWith(s);
  // s.append(node);
  input.addEventListener('input', cancelEvent, {capture: true, once: true, passive: false});
  richInputHandler?.onBeforeInput({inputType: 'insertContent'});
  window.document.execCommand('insertHTML', false, html);
  Array.from(input.querySelectorAll<HTMLImageElement>('[data-ces]')).forEach((el, idx) => {
    delete el.dataset.ces;
    const customEmojiElement = customEmojiElements[idx];
    (el as any).customEmojiElement = customEmojiElement;
    customEmojiElement.placeholder = el;
  });
  // fillers.forEach((el) => {
  //   el.contentEditable = 'inherit';
  // });
  input.querySelectorAll<HTMLElement>('.pc').forEach((el) => {
    el.contentEditable = 'false';
  });
  if(textNode) {
    const {nodeValue} = textNode;
    if(nodeValue === textNodeValue) {
      textNode.remove();
    } else {
      (textNode as CharacterData).replaceData(nodeValue.indexOf(textNodeValue), textNodeValue.length, '');
    }
  }
  // restore();
  richInputHandler?.removeExtraBOMs(input);
  simulateEvent(input, 'input');

  // if(textNode) {
  //   const selection = document.getSelection();
  //   const node = fragmentLastChild.nextSibling || fragmentLastChild;
  //   const range = document.createRange();
  //   range.setStartAfter(node);
  //   range.collapse(true);
  //   selection.removeAllRanges();
  //   selection.addRange(range);
  // }

  // const after = getCaretPosNew(input);
  // console.log('after', after);
  // if(after.node?.nodeValue === BOM) {
  //   const smth = findUpClassName(after.node.parentElement, 'input-something');
  //   if(smth) {
  //     const selection = document.getSelection();
  //     const node = smth.nextSibling;
  //     const range = document.createRange();
  //     range.setStartAfter(node);
  //     range.collapse(true);
  //     selection.removeAllRanges();
  //     selection.addRange(range);

  //     // if(after.offset === 0) after.selection.modify('extend', 'forward', 'character');
  //     // after.selection.modify('extend', 'forward', 'character');
  //     // after.selection.collapseToEnd();
  //   }
  // }

  // setCaretAt(fragmentLastChild.nextSibling);

  // console.log('ASD');
}

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
    let plainText: string = (e.originalEvent || e).clipboardData.getData('text/plain').replace(/\r/g, '');
    let usePlainText = true;

    // @ts-ignore
    let html: string = (e.originalEvent || e).clipboardData.getData('text/html') || plainText;

    const filterEntity = (e: MessageEntity) => e._ === 'messageEntityEmoji' || (e._ === 'messageEntityLinebreak' && !noLinebreaks);
    if(noLinebreaks) {
      const regExp = /[\r\n]/g;
      plainText = plainText.replace(regExp, '');
      html = html.replace(regExp, '');
    }

    const peerId = (input.dataset.peerId || NULL_PEER_ID).toPeerId();
    if(html.trim()) {
      // console.log(html.replace(/ (style|class|id)=".+?"/g, ''));

      html = html.replace(/<style([\s\S]*)<\/style>/, '');
      html = html.replace(/<!--([\s\S]*?)-->/g, '');
      html = html.replace('<br class="Apple-interchange-newline">', '');
      html = html.replace(/\r/g, '');
      html = html.replace(/<hr([\s\S]*?)</g, '<');

      const match = html.match(/<body>([\s\S]*)<\/body>/);
      if(match) {
        html = match[1].trim();
      }

      // const s = cleanHTML(html, true) as NodeList;
      // console.log(s);

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const span = doc.body || document.createElement('body');

      // const span: HTMLElement = document.createElement('span');
      // span.innerHTML = html;
      // span.append(...Array.from(s));

      /* function canRenderText(el: HTMLElement) {
        const forbidden = new Set([
          'html', 'head', 'meta', 'link', 'style', 'script', 'template', 'title', 'base',
          'iframe', 'frame', 'frameset', 'object', 'param', 'source', 'track',
          'ul', 'ol', 'menu', 'dl',
          'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup'
        ]);

        return !forbidden.has(el.tagName.toLowerCase());
      }

      // * fix whitespace between elements like <p>asd</p>\n<p>zxc</p>
      function removeEmptyTextNodes(node: Node) {
        let curChild = node.firstChild;
        while(curChild) {
          const nextSibling = curChild.nextSibling;
          if(curChild.nodeType === curChild.TEXT_NODE) {
            if(
              !canRenderText(curChild.parentElement) ||
              ((curChild.parentElement.tagName === 'BODY' || !curChild.previousSibling || !curChild.nextSibling) && !curChild.nodeValue.trim())
            ) {
              curChild.remove();
            }
          } else {
            removeEmptyTextNodes(curChild);
          }

          curChild = nextSibling;
        }
      }

      // ! commented because discovered that \n in <h1>asd</h1>\n<p>asd</p> should be preserved
      removeEmptyTextNodes(doc.body); */

      const richValue = getRichValueWithCaret(span, true, false);

      const canWrapCustomEmojis = !!input.dataset.canWrapCustomEmojis || !!peerId;
      if(!canWrapCustomEmojis) {
        richValue.entities = richValue.entities.filter((entity) => entity._ !== 'messageEntityCustomEmoji');
      }

      /* { // * fix extra new lines appearing from <p> (can have them from some sources, like macOS Terminal)
        const lines = richValue.value.split('\n');
        let textLength = 0;
        for(let lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
          const line = lines[lineIndex];
          textLength += line.length;

          const index = textLength;
          if(plainText[index] !== '\n' && lineIndex !== (lines.length - 1)) {
            const nextLine = lines.splice(lineIndex + 1, 1)[0];
            lines[lineIndex] = line + nextLine;

            // fix entities
            richValue.entities.forEach((entity) => {
              if(entity.offset >= index) {
                entity.offset -= 1;
              }
            });

            textLength += nextLine.length;
          }

          textLength += 1;
        }

        const correctedText = lines.join('\n');
        richValue.value = correctedText;
      } */

      // * fix new lines
      {
        // * first we clear all the new lines from rich value
        const richValueSplitted = richValue.value.split('');
        forEachReverse(richValueSplitted, (char, index, arr) => {
          if(char === '\n') {
            arr.splice(index, 1);
            richValue.entities.forEach((entity) => {
              if(entity.offset >= index) {
                entity.offset -= 1;
              }
            });
          }
        });

        // * then we add new lines to rich value
        const plainTextLines = plainText.split('\n');
        let plainTextLength = 0;
        for(const line of plainTextLines) {
          plainTextLength += line.length;
          richValueSplitted.splice(plainTextLength, 0, '\n');
          richValue.entities.forEach((entity) => {
            if(entity.offset >= plainTextLength) {
              entity.offset += 1;
            }
          });

          plainTextLength += 1;
        }

        richValue.value = richValueSplitted.join('');
      }

      const richTextLength = richValue.value.replace(/\s/g, '').length;
      const plainTextLength = plainText.replace(/\s/g, '').length;
      if(richTextLength === plainTextLength ||
        richValue.entities.find((entity) => entity._ === 'messageEntityCustomEmoji')) {
        text = richValue.value;
        entities = richValue.entities;
        usePlainText = false;

        let entities2 = parseEntities(text);
        entities2 = entities2.filter(filterEntity);
        entities = mergeEntities(entities, entities2);
      }

      // console.log('usePlainText', usePlainText);
    }

    if(usePlainText) {
      text = plainText;
      entities = parseEntities(text);
      entities = entities.filter(filterEntity);
    }

    insertRichTextAsHTML(input, text, entities, peerId);
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
  placeholderAsElement?: boolean,
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
  autocomplete?: string,
  withBorder?: boolean,
  allowStartingSpace?: boolean,
  onRawInput?: (value: string) => void,
  canHaveFormatting?: Array<MarkupTooltipTypes>
  canWrapCustomEmojis?: boolean;
};

function createCustomEmojiRendererForInput(textColor?: string, animationGroup?: AnimationItemGroup) {
  const renderer = CustomEmojiRendererElement.create({
    wrappingDraft: true,
    isSelectable: true,
    textColor: textColor || 'primary-text-color',
    animationGroup
  });

  return renderer;
}

function processCustomEmojisInInput(input: HTMLElement) {
  const customEmojiElements = Array.from(input.querySelectorAll<CustomEmojiElement | HTMLElement>('.custom-emoji, .custom-emoji-placeholder'));
  let renderer = input.querySelector<CustomEmojiRendererElement>('.custom-emoji-renderer');
  if(!renderer && customEmojiElements.length) {
    renderer = createCustomEmojiRendererForInput(input.dataset.textColor, input.dataset.animationGroup as AnimationItemGroup);
    input.prepend(renderer);
  } else if(renderer && !customEmojiElements.length) {
    renderer.remove();
    return;
  }

  if(!renderer) {
    return;
  }

  const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0]['addCustomEmojis'] = new Map();
  customEmojiElements.forEach((element) => {
    const customEmojiElement: CustomEmojiElement = (element as CustomEmojiElement).loop !== undefined ? element as CustomEmojiElement : (element as any).customEmojiElement as CustomEmojiElement;
    const {docId} = customEmojiElement;
    let set = customEmojis.get(docId);
    if(!set) {
      customEmojis.set(docId, set = new Set());
    }

    set.add(customEmojiElement);
  });

  for(const [docId, customEmojiElements] of customEmojis) {
    let hasSet = renderer.customEmojis.get(docId);
    if(hasSet) {
      for(const customEmojiElement of hasSet) {
        if(!customEmojiElements.has(customEmojiElement)) {
          customEmojiElement.destroy();
        }
      }
    } else {
      hasSet = new Set();
    }

    for(const customEmojiElement of customEmojiElements) {
      if(!hasSet.has(customEmojiElement)) {
        customEmojiElement.connectedCallback();
      }
    }
  }

  renderer.add({
    addCustomEmojis: customEmojis,
    lazyLoadQueue: false
  });
  renderer.forceRender();
}

export default class InputField {
  public container: HTMLElement;
  public input: HTMLElement;
  public label: HTMLLabelElement;
  public placeholder: HTMLElement;

  public originalValue: string;

  public required: boolean;
  public validate: () => boolean;

  public allowStartingSpace: boolean;

  private isInputHidden = false;

  constructor(public options: InputFieldOptions = {}) {
    this.container = document.createElement('div');
    this.container.classList.add('input-field');

    this.required = options.required;
    this.validate = options.validate;

    if(options.maxLength !== undefined && options.showLengthOn === undefined) {
      options.showLengthOn = Math.min(40, Math.round(options.maxLength / 3));
    }

    const {placeholder, maxLength, showLengthOn, name, plainText, canBeEdited = true, autocomplete, withBorder, allowStartingSpace, canHaveFormatting, canWrapCustomEmojis} = options;
    const label = options.label || options.labelText;
    this.allowStartingSpace = allowStartingSpace;

    const onInputCallbacks: Array<() => void> = [];
    let input: HTMLElement;
    if(!plainText) {
      if(init) {
        init();
      }

      this.container.innerHTML = `<div class="input-field-input"></div>`;

      input = this.container.firstElementChild as HTMLElement;
      input.contentEditable = '' + !!canBeEdited;
      // const observer = new MutationObserver(() => {
      //   //checkAndSetRTL(input);

      //   if(processInput) {
      //     processInput();
      //   }
      // });

      RichInputHandler.getInstance();

      input.addEventListener('mousedown', (e) => {
        const selection = document.getSelection();
        if(!selection.isCollapsed) {
          return;
        }

        const placeholder = findUpTag(e.target, 'IMG');
        if(!placeholder) {
          return;
        }

        const rect = placeholder.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const focusOnNext = e.clientX >= centerX;

        const range = document.createRange();
        range.setStartAfter(focusOnNext ? placeholder : placeholder.previousSibling ?? placeholder);
        selection.removeAllRanges();
        selection.addRange(range);
      });

      if(canHaveFormatting) {
        input.setAttribute('can-format', canHaveFormatting.join(','));
      }

      onInputCallbacks.push(() => {
        // console.log('input');
        // return;
        // * because if delete all characters there will br left
        const isEmpty = this.isEmpty();
        if(isEmpty) {
          // const textNode = Array.from(input.childNodes).find((node) => node.nodeType === node.TEXT_NODE) || document.createTextNode('');
          input.replaceChildren();
          // input.append(document.createTextNode('')); // need first text node to support history stack
        }

        this.setEmpty(isEmpty);

        // const fillers = Array.from(input.querySelectorAll('.emoji-filler')) as HTMLElement[];
        // fillers.forEach((filler) => {
        //   const textContent = filler.textContent;
        //   if(textContent === BOM) {
        //     return;
        //   }

        //   if(textContent) {

        //   } else {
        //     let curChild = filler.firstChild;
        //     while(curChild) {
        //       curChild = curChild.nextSibling;
        //     }
        //   }

        //   filler.classList.remove('emoji-filler');
        // });

        // Array.from(input.querySelectorAll('br, span:empty')).forEach((el) => {
        //   const parentElement = el.parentElement;
        //   (parentElement === input ? el : parentElement).remove();
        // });
        USING_BOMS && Array.from(input.querySelectorAll('br:not(.br-not-br)')).forEach((el) => {
          // const parentElement = el.parentElement;
          el.remove();
          // if(!parentElement.children.length && !parentElement.textContent) {
          //   parentElement.textContent = '';
          // }
        });

        insertCustomFillers(Array.from(input.querySelectorAll('.input-something')));

        processCustomEmojisInInput(input);

        // .forEach((el) => el.remove());
      });

      // ! childList for paste first symbol
      // observer.observe(input, {characterData: true, childList: true, subtree: true});
    } else {
      this.container.innerHTML = `
      <input type="text" ${name ? `name="${name}"` : ''} autocomplete="${autocomplete ?? 'off'}" ${label ? 'required=""' : ''} class="input-field-input">
      `;

      input = this.container.firstElementChild as HTMLElement;
      // input.addEventListener('input', () => checkAndSetRTL(input));

      onInputCallbacks.push(() => {
        const isEmpty = this.isEmpty();
        if(isEmpty) {
          (input as HTMLInputElement).value = '';
        }

        this.setEmpty(isEmpty);
      });
    }

    setDirection(input);

    if(options.inputMode) {
      input.inputMode = options.inputMode;
    }

    if(placeholder) {
      // if(options.placeholderAsElement) {
      this.placeholder = document.createElement('span');
      this.placeholder.classList.add('input-field-placeholder');
      this.container.append(this.placeholder);
      _i18n(this.placeholder, placeholder, undefined);
      // } else {
      //   _i18n(input, placeholder, undefined, 'placeholder');
      // }
    }

    if(withBorder !== false && withBorder || label || placeholder) {
      const border = document.createElement('div');
      border.classList.add('input-field-border');
      this.container.append(border);
    }

    if(label != null) {
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
        const inputLength = plainText ? (input as HTMLInputElement).value.length : [...getRichValueWithCaret(input, false, false).value].length;
        const diff = maxLength - inputLength;
        const isError = diff < 0;
        input.classList.toggle('error', isError);

        // this.onLengthChange && this.onLengthChange(inputLength, isError);

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

    if(options.onRawInput) {
      onInputCallbacks.push(() => {
        options.onRawInput(this.value);
      });
    }

    if(onInputCallbacks.length) {
      input.addEventListener('input', () => {
        onInputCallbacks.forEach((callback) => callback());
      });
    }

    if(canWrapCustomEmojis) input.dataset.canWrapCustomEmojis = '1';

    this.input = input;
    this.setEmpty(true);
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
    this.label.style.visibility = this.label.textContent ? 'visible' : 'hidden';
  }

  get value(): string {
    return this.options.plainText ? (this.input as HTMLInputElement).value : getRichValueWithCaret(this.input, false, false).value;
    // return getRichValue(this.input);
  }

  set value(value: Parameters<typeof replaceContent>[1]) {
    this.setValueSilently(value, true);
    this.simulateInputEvent();
  }

  public simulateInputEvent() {
    simulateEvent(this.input, 'input');
  }

  public setValueSilently(value: Parameters<typeof replaceContent>[1], fromSet?: boolean) {
    if(this.options.plainText) {
      (this.input as HTMLInputElement).value = value as string;
    } else {
      replaceContent(this.input, value);
      processCustomEmojisInInput(this.input);
    }

    this.setEmpty();
  }

  private setEmpty = (empty = this.isEmpty()) => {
    [this.input, this.placeholder].filter(Boolean).forEach((el) => {
      el.classList.toggle('is-empty', empty);
    });
  };

  public setHidden(hidden: boolean) {
    this.isInputHidden = hidden;
    this.setEmpty();
  }

  public isEmpty() {
    return isInputEmpty(this.input, this.allowStartingSpace) || this.isInputHidden;
  }

  public isChanged() {
    return this.value !== this.originalValue;
  }

  public isValid() {
    return !this.input.classList.contains('error') &&
      (!this.validate || this.validate()) &&
      (!this.required || !this.isEmpty());
  }

  public isValidToChange() {
    return this.isValid() && this.isChanged();
  }

  public setDraftValue(value = '', silent?: boolean) {
    let _value: Parameters<typeof replaceContent>[1] = value;
    if(!this.options.plainText) {
      _value = /* documentFragmentToHTML */(wrapDraftText(value));
    }

    if(silent) {
      this.setValueSilently(_value, false);
    } else {
      this.value = _value;
    }
  }

  public setOriginalValue(value: InputField['originalValue'] = '', silent?: boolean) {
    this.originalValue = value;
    this.setDraftValue(value, silent);
  }

  public setState(state: InputState, label?: LangPackKey, labelOptions?: any[]) {
    if(label) {
      this.label.textContent = '';
      this.label.append(i18n(label, labelOptions ?? this.options.labelOptions));
      this.label.style.visibility = 'visible';
    } else {
      this.setLabel();
    }

    this.input.classList.toggle('error', !!(state & InputState.Error));
    this.input.classList.toggle('valid', !!(state & InputState.Valid));
  }

  public setError(label?: LangPackKey, labelOptions?: any[]) {
    this.setState(InputState.Error, label, labelOptions);
  }

  public toggleForceFocus(enabled: boolean) {
    this.input.classList.toggle('force-focus', enabled)
  }
}
