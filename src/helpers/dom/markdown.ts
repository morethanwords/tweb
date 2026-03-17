/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MarkupTooltip from '@components/chat/markupTooltip';
import {FontFamilyName} from '@config/font';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import cancelEvent from '@helpers/dom/cancelEvent';
import simulateEvent from '@helpers/dom/dispatchEvent';
import getCharAfterRange from '@helpers/dom/getCharAfterRange';
import {MarkdownType} from '@helpers/dom/getRichElementValue';
import getMarkupInSelection from '@helpers/dom/getMarkupInSelection';
import isSelectionEmpty from '@helpers/dom/isSelectionEmpty';
import RichInputHandler from '@helpers/dom/richInputHandler';
import {setDirection} from '@helpers/dom/setInnerHTML';
import filterUnique from '@helpers/array/filterUnique';

const cacheMap = new WeakMap<HTMLElement, MarkdownCache>();

type MarkdownCache = {
  lockRedo: boolean;
  canRedoFromHTML: string;
  readonly undoHistory: string[];
  readonly executedHistory: string[];
  canUndoFromHTML: string;
};

export function joinMarkupNames(types: MarkdownType[]) {
  return 'markup-' + filterUnique(types).join('-');
}

export function splitMarkupNames(markup: string) {
  return markup.split('-').slice(1).map((str) => str.split(/\d/, 1)[0]) as MarkdownType[];
}

export function createMarkdownCache(input: HTMLElement): MarkdownCache {
  return;

  const cache: MarkdownCache = {
    lockRedo: false,
    canRedoFromHTML: '',
    undoHistory: [],
    executedHistory: [],
    canUndoFromHTML: ''
  };

  cacheMap.set(input, cache);
  return cache;
}

export function clearMarkdownExecutions(input: HTMLElement) {
  const cache = cacheMap.get(input);
  if(!cache) {
    return;
  }

  cache.canRedoFromHTML = '';
  cache.undoHistory.length = 0;
  cache.executedHistory.length = 0;
  cache.canUndoFromHTML = '';
}

export function maybeClearUndoHistory(input: HTMLElement) {
  const cache = cacheMap.get(input);
  if(!cache) {
    return;
  }

  if(cache.canRedoFromHTML && !cache.lockRedo && input.innerHTML !== cache.canRedoFromHTML) {
    cache.canRedoFromHTML = '';
    cache.undoHistory.length = 0;
  }
}

export function prepareDocumentExecute(input: HTMLElement) {
  const cache = cacheMap.get(input);
  if(!cache) {
    return;
  }

  cache.executedHistory.push(input.innerHTML);
  return () => cache.canUndoFromHTML = input.innerHTML;
};

export function undoRedo(input: HTMLElement, e: Event, type: 'undo' | 'redo', needHTML: string) {
  cancelEvent(e); // cancel legacy event
  const cache = cacheMap.get(input);
  if(!cache) {
    return;
  }

  let html = input.innerHTML;
  if(html && html !== needHTML) {
    cache.lockRedo = true;

    let sameHTMLTimes = 0;
    do {
      document.execCommand(type, false, null);
      const currentHTML = input.innerHTML;
      if(html === currentHTML) {
        if(++sameHTMLTimes > 2) { // * unlink, removeFormat (а может и нет, случай: заболдить подчёркнутый текст (выделить ровно его), попробовать отменить)
          break;
        }
      } else {
        sameHTMLTimes = 0;
      }

      html = currentHTML;
    } while(html !== needHTML);

    cache.lockRedo = false;
  }
}

const canCombine: readonly MarkdownType[] = ['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'quote'];
const canCombineWithQuote: readonly MarkdownType[] = ['monospace', 'date'];
const cantCombine: readonly MarkdownType[] = ['monospace', 'date'];
const NO_INNER_QUOTES = false;

export function applyMarkdown({input, type, href, dateSuffix}: {input: HTMLElement, type: MarkdownType, href?: string, dateSuffix?: string}) {
  // const MONOSPACE_FONT = 'var(--font-monospace)';
  // const SPOILER_FONT = 'spoiler';
  const commandsMap: Partial<{[key in typeof type]: string | (() => void)}> = {
    // bold: 'Bold',
    // italic: 'Italic',
    // underline: 'Underline',
    // strikethrough: 'Strikethrough',
    // monospace: () => document.execCommand('fontName', false, MONOSPACE_FONT),
    link: href ? () => document.execCommand('createLink', false, href) : resetLinkFormatting
    // quote: () => document.execCommand('formatBlock', false, 'blockquote')
    // spoiler: () => document.execCommand('fontName', false, SPOILER_FONT)
  };

  const processCommand = (type: MarkdownType) => {
    const isCombineable = canCombine.includes(type);
    const isQuoteCombineable = isCombineable || canCombineWithQuote.includes(type);
    const canHaveTypes = isCombineable ? canCombine.slice() : [type];

    // * these types can actually combine
    if(type === 'quote') canHaveTypes.push(...canCombineWithQuote);
    else if(canCombineWithQuote.includes(type)) {
      canHaveTypes.push('quote');
    }

    const currentType = hasMarkup[type];
    const isRemoving = !!(MarkupTooltip.DISPLAY_MARKUP_PARTLY ? currentType?.partly : currentType?.fully) && !dateSuffix;
    const k = canHaveTypes.filter((type) => hasMarkup[type]?.fully);
    if(isRemoving) {
      indexOfAndSplice(k, type);
    } else {
      k.push(dateSuffix ? type + dateSuffix as any : type);
    }

    // * don't spawn inner quote formatting
    if(NO_INNER_QUOTES && isQuoteCombineable && hasMarkup.quote.fully) {
      indexOfAndSplice(k, 'quote');
    }

    if(type === 'quote') {
      const selection = document.getSelection();
      if(selection.rangeCount && getCharAfterRange(selection.getRangeAt(0)) === '\n') {
        const toLeft = false;
        selection.modify(
          selection.isCollapsed ? 'move' : 'extend',
          toLeft ? 'backward' : 'forward', 'character'
        );
      }
    }

    let ret: boolean;
    if(k.length) {
      ret = document.execCommand('fontName', false, joinMarkupNames(k));
    } else {
      ret = resetCurrentFontFormatting();
    }

    // try {
    processCurrentFormatting(input, {type, active: !isRemoving});
    // } catch(err) {
    //   console.error('markdown err', err);
    // }

    return ret;
  };

  [...canCombine, ...cantCombine].forEach((type) => {
    commandsMap[type] = processCommand.bind(null, type);
  });

  if(!commandsMap[type]) {
    return false;
  }

  const command = commandsMap[type];

  // type = 'monospace';

  // const saveExecuted = this.prepareDocumentExecute();
  const executed: any[] = [];
  /**
   * * clear previous formatting, due to Telegram's inability to handle several entities
   */
  /* const checkForSingle = () => {
    const nodes = getSelectedNodes();
    //console.log('Using formatting:', commandsMap[type], nodes, this.executedHistory);

    const parents = [...new Set(nodes.map((node) => node.parentNode))];
    //const differentParents = !!nodes.find((node) => node.parentNode !== firstParent);
    const differentParents = parents.length > 1;

    let notSingle = false;
    if(differentParents) {
      notSingle = true;
    } else {
      const node = nodes[0];
      if(node && (node.parentNode as HTMLElement) !== this.messageInput && (node.parentNode.parentNode as HTMLElement) !== this.messageInput) {
        notSingle = true;
      }
    }

    if(notSingle) {
      //if(type === 'monospace') {
        executed.push(document.execCommand('styleWithCSS', false, 'true'));
      //}

      executed.push(document.execCommand('unlink', false, null));
      executed.push(document.execCommand('removeFormat', false, null));
      executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));

      //if(type === 'monospace') {
        executed.push(document.execCommand('styleWithCSS', false, 'false'));
      //}
    }
  }; */

  // fix applying markdown when range starts from contenteditable="false"
  // let textNode: Text;
  // do {
  //   // const {node, offset, selection} = getCaretPosNew(this.messageInput, true);
  //   const selection = document.getSelection();
  //   const range = selection.getRangeAt(0);
  //   const {node, offset} = getCaretPosF(this.messageInput, range.startContainer, range.startOffset);
  //   // const node = range.startContainer as ChildNode;
  //   if(node?.textContent === BOM || (node as HTMLElement)?.isContentEditable === false) {
  //     // selection.modify('extend', 'backward', 'character');
  //     textNode = document.createTextNode(BOM);
  //     (node.nodeType === node.ELEMENT_NODE ? node : node.parentElement).before(textNode);
  //     range.setStart(textNode, 0);
  //   }/*  else {
  //     break;
  //   } */

  //   break;
  // } while(true);

  const richInputHandler = RichInputHandler.getInstance();
  const restore = richInputHandler.prepareApplyingMarkdown();

  const listenerOptions: AddEventListenerOptions = {capture: true, passive: false};
  input.addEventListener('input', cancelEvent, listenerOptions);

  executed.push(document.execCommand('styleWithCSS', false, 'true'));

  const commandsKeys = Object.keys(commandsMap) as (typeof type)[];
  const hasMarkup = getMarkupInSelection(commandsKeys);

  // * monospace can't be combined with different types
  /* if(type === 'monospace' || type === 'spoiler') {
    // executed.push(document.execCommand('styleWithCSS', false, 'true'));

    const haveThisType = hasMarkup[type];
    // executed.push(document.execCommand('removeFormat', false, null));

    if(haveThisType) {
      executed.push(this.resetCurrentFontFormatting());
    } else {
      // if(type === 'monospace' || hasMarkup['monospace']) {
      //   executed.push(this.resetCurrentFormatting());
      // }

      executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
    }
  } else  */{
    if(cantCombine.some((type) => hasMarkup[type]?.partly) && type === 'link') {
      executed.push(resetCurrentFormatting());
    } else if(hasMarkup['link']?.partly && cantCombine.includes(type)) {
      executed.push(resetLinkFormatting());
    }

    executed.push(typeof(command) === 'function' ? command() : document.execCommand(command, false, null));
  }

  executed.push(document.execCommand('styleWithCSS', false, 'false'));

  restore();

  // checkForSingle();
  // saveExecuted();
  MarkupTooltip.getInstance().setActiveMarkupButton();

  // if(textNode) {
  //   (textNode.parentElement === this.messageInput ? textNode : textNode.parentElement).remove();
  //   textNode.nodeValue = '';
  // }

  input.removeEventListener('input', cancelEvent, listenerOptions);
  simulateEvent(input, 'input');

  return true;
}

export function processCurrentFormatting(
  input: HTMLElement,
  toggling?: {
    type: MarkdownType,
    active: boolean
  },
  inputType?: 'historyUndo' | 'historyRedo'
) {
  const quoteSelectorByData = '[data-markup*="quote"]';
  const quoteSelectorByStyle = '[style*="quote"]';
  const quoteClasses = ['quote', 'quote-block', 'quote-like', 'quote-like-icon', 'quote-like-border'];
  // const perf = performance.now();
  // * add styles
  const add = () => (input.querySelectorAll('[style*="font-family"]') as NodeListOf<HTMLElement>)
  .forEach((element) => {
    if(element.style.caretColor) { // cleared blockquote
      element.style.cssText = '';
      return;
    }

    const fontFamily = element.style.fontFamily;
    if(fontFamily === FontFamilyName) {
      return;
    }

    let markup = fontFamily;
    // * fix inner quotes
    if(
      NO_INNER_QUOTES &&
      markup.includes('quote') &&
      element.parentElement.closest('[data-markup*="quote"]') &&
      toggling?.type !== 'quote'
      // element.parentElement.closest('[style*="quote"]')
    ) {
      const splitted = splitMarkupNames(markup);
      indexOfAndSplice(splitted, 'quote');
      if(splitted.length) {
        markup = joinMarkupNames(splitted);
      } else {
        element.style.fontFamily = '';
        delete element.dataset.markup;
        return;
      }
    }

    // * process date suffix
    if(markup.includes('date')) {
      const dateSuffix = markup.split('date')[1].split('-')[0];
      if(dateSuffix) {
        markup = markup.replace('date' + dateSuffix, 'date');
        element.dataset.date = dateSuffix;
      }
    }

    element.classList.add('is-markup');
    element.dataset.markup = markup;
    if(fontFamily !== markup) element.style.fontFamily = markup;
    setDirection(element);
  });

  // * remove styles
  const remove = () => (input.querySelectorAll('.is-markup') as NodeListOf<HTMLElement>)
  .forEach((element) => {
    const fontFamily = element.style.fontFamily;
    if(fontFamily && fontFamily !== FontFamilyName) {
      return;
    }

    // * fix (restore / remove conflicting) nested/intersecting formatting
    // * for exampe, toggling italic for selection but part of it has bold
    // let {markup} = element.dataset;
    // if(toggling && !markup.includes(toggling.type)) {
    //   if(toggling.active) {
    //     let goodTypes: MarkdownType[];
    //     if(cantCombine.includes(toggling.type)) { // * filter out other formatting when adding monospace, etc
    //       goodTypes = splitMarkupNames(markup)
    //       .filter((type) => type === 'quote' || type === toggling.type);
    //     } else { // * filter out monospace, etc when adding bold
    //       goodTypes = splitMarkupNames(markup)
    //       .filter((type) => canCombine.includes(type));
    //     }

    //     if(goodTypes?.length) {
    //       markup = joinMarkupNames(goodTypes);
    //       element.style.fontFamily = element.dataset.markup = markup;
    //       return;
    //     }
    //   } else { // * keep the other formatting if we remove something else
    //     element.style.fontFamily = markup;
    //     return;
    //   }
    // } else if(!toggling && markup) { // * auto mode (undo/redo). preserve intersecting formatting
    //   element.style.fontFamily = markup;
    //   return;
    // }
    let {markup} = element.dataset;
    if(toggling) {
      let goodTypes: MarkdownType[];
      if(cantCombine.includes(toggling.type)) { // * filter out other formatting when adding monospace, etc
        goodTypes = splitMarkupNames(markup)
        .filter((type) => type === 'quote' || type === toggling.type);
      } else { // * filter out monospace, etc when adding bold
        goodTypes = splitMarkupNames(markup)
        .filter((type) => canCombine.includes(type));
      }

      if(!toggling.active) {
        indexOfAndSplice(goodTypes, toggling.type);
      }

      if(goodTypes.length) {
        markup = joinMarkupNames(goodTypes);
        element.style.fontFamily = element.dataset.markup = markup;
        return;
      }
    } else if(!toggling && markup) { // * auto mode (undo/redo). preserve intersecting formatting
      element.style.fontFamily = markup;
      return;
    }

    element.classList.remove('is-markup');
    delete element.dataset.markup;
  });

  const processQuotes = () => {
    (input.querySelectorAll(quoteSelectorByData) as NodeListOf<HTMLElement>)
    .forEach((element) => {
      const isRealQuote = !element.parentElement.closest(quoteSelectorByData);
      if(isRealQuote) element.classList.add(...quoteClasses);
      else element.classList.remove(...quoteClasses);
      delete element.dataset.brokenQuote;
    });

    (input.querySelectorAll(`.${quoteClasses[0]}:not(${quoteSelectorByData})`) as NodeListOf<HTMLElement>)
    .forEach((element) => {
      element.classList.remove(...quoteClasses);
      element.dataset.brokenQuote = 'true';
    });
  };

  // * fix case when browser decides to mess up the quote
  // * rely on the browser's ability to set font-family correctly
  const fixQuotes = () => {
    (input.querySelectorAll(`${quoteSelectorByData}:not(${quoteSelectorByStyle})`) as NodeListOf<HTMLElement>)
    .forEach((element) => {
      // * need to check the length because 'every' will return true if the array is empty
      const children = Array.from(element.children) as HTMLElement[];
      const canReallyBeQuote = children.length && children.every((child) => {
        return child.matches(quoteSelectorByStyle);
      });

      const {markup} = element.dataset;
      if(canReallyBeQuote) {
        element.style.fontFamily = markup;
      } else {
        const goodTypes = splitMarkupNames(markup);
        indexOfAndSplice(goodTypes, 'quote');
        if(goodTypes.length) {
          element.dataset.markup = joinMarkupNames(goodTypes);
        } else {
          delete element.dataset.markup;
        }
      }
    });
  };

  if(inputType === 'historyRedo') {
    // return;
    fixQuotes();
  }

  const order = [add, remove];
  order.forEach((callback) => callback());
  processQuotes();
  // console.log('process formatting', performance.now() - perf);
}

export function resetCurrentFormatting() {
  return document.execCommand('removeFormat', false, null);
}

export function resetCurrentFontFormatting() {
  return document.execCommand('fontName', false, FontFamilyName);
}

export function resetLinkFormatting() {
  return document.execCommand('unlink', false, null);
}

export function handleMarkdownShortcut(input: HTMLElement, e: KeyboardEvent) {
  // console.log('handleMarkdownShortcut', e);
  const formatKeys: {[key: string]: MarkdownType} = {
    'KeyB': 'bold',
    'KeyI': 'italic',
    'KeyU': 'underline',
    'KeyS': 'strikethrough',
    'KeyM': 'monospace',
    'KeyP': 'spoiler',
    'KeyK': 'link'
  };

  const code = e.code;
  const markdownType = formatKeys[code];

  const selection = document.getSelection();
  if(!isSelectionEmpty(selection) && markdownType) {
    // * костыльчик
    if(code === 'KeyK') {
      MarkupTooltip.getInstance().showLinkEditor();
    } else {
      applyMarkdown({input, type: markdownType});
    }

    cancelEvent(e); // cancel legacy event
  }

  // return;
  // if(code === 'KeyZ') {
  //   let html = this.messageInput.innerHTML;

  //   if(e.shiftKey) {
  //     if(this.undoHistory.length) {
  //       this.executedHistory.push(html);
  //       html = this.undoHistory.pop();
  //       this.undoRedo(e, 'redo', html);
  //       html = this.messageInput.innerHTML;
  //       this.canRedoFromHTML = this.undoHistory.length ? html : '';
  //       this.canUndoFromHTML = html;
  //     }
  //   } else {
  //     // * подождём, когда пользователь сам восстановит поле до нужного состояния, которое стало сразу после saveExecuted
  //     if(this.executedHistory.length && (!this.canUndoFromHTML || html === this.canUndoFromHTML)) {
  //       this.undoHistory.push(html);
  //       html = this.executedHistory.pop();
  //       this.undoRedo(e, 'undo', html);

  //       // * поставим новое состояние чтобы снова подождать, если пользователь изменит что-то, и потом попробует откатить до предыдущего состояния
  //       this.canUndoFromHTML = this.canRedoFromHTML = this.messageInput.innerHTML;
  //     }
  //   }
  // }
};
