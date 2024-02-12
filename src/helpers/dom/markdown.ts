/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MarkupTooltip from '../../components/chat/markupTooltip';
import {FontFamilyName} from '../../config/font';
import indexOfAndSplice from '../array/indexOfAndSplice';
import cancelEvent from './cancelEvent';
import simulateEvent from './dispatchEvent';
import getCharAfterRange from './getCharAfterRange';
import {MarkdownType} from './getRichElementValue';
import getMarkupInSelection from './getMarkupInSelection';
import isSelectionEmpty from './isSelectionEmpty';
import RichInputHandler from './richInputHandler';
import {setDirection} from './setInnerHTML';

const cacheMap = new WeakMap<HTMLElement, MarkdownCache>();

type MarkdownCache = {
  lockRedo: boolean;
  canRedoFromHTML: string;
  readonly undoHistory: string[];
  readonly executedHistory: string[];
  canUndoFromHTML: string;
};

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

export function applyMarkdown(input: HTMLElement, type: MarkdownType, href?: string) {
  // const MONOSPACE_FONT = 'var(--font-monospace)';
  // const SPOILER_FONT = 'spoiler';
  const commandsMap: Partial<{[key in typeof type]: string | (() => void)}> = {
    // bold: 'Bold',
    // italic: 'Italic',
    // underline: 'Underline',
    // strikethrough: 'Strikethrough',
    // monospace: () => document.execCommand('fontName', false, MONOSPACE_FONT),
    link: href ? () => document.execCommand('createLink', false, href) : () => document.execCommand('unlink', false, null)
    // quote: () => document.execCommand('formatBlock', false, 'blockquote')
    // spoiler: () => document.execCommand('fontName', false, SPOILER_FONT)
  };

  const c = (type: MarkdownType) => {
    commandsMap[type] = () => {
      const k = (canCombine.includes(type) ? canCombine : [type]).filter((type) => hasMarkup[type]?.active);
      if(!indexOfAndSplice(k, type)) {
        k.push(type);
      }

      if(type === 'quote'/*  && k.includes(type) */) {
        const selection = document.getSelection();
        if(selection.rangeCount && getCharAfterRange(selection.getRangeAt(0)) === '\n') {
          const toLeft = false;
          selection.modify(selection.isCollapsed ? 'move' : 'extend', toLeft ? 'backward' : 'forward', 'character');
        }
      }

      let ret: boolean;
      if(!k.length) {
        ret = resetCurrentFontFormatting();
      } else {
        ret = document.execCommand('fontName', false, 'markup-' + k.join('-'));
      }

      processCurrentFormatting(input);

      return ret;
    };
  };

  const canCombine: (typeof type)[] = ['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'quote'];
  canCombine.forEach((type) => {
    c(type);
  });

  c('monospace');

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

  const hasMarkup = getMarkupInSelection(Object.keys(commandsMap) as (typeof type)[]);

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
    if(hasMarkup['monospace']?.active && type === 'link') {
      executed.push(resetCurrentFormatting());
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

export function processCurrentFormatting(input: HTMLElement) {
  // const perf = performance.now();
  (input.querySelectorAll('[style*="font-family"]') as NodeListOf<HTMLElement>).forEach((element) => {
    if(element.style.caretColor) { // cleared blockquote
      element.style.cssText = '';
      return;
    }

    const fontFamily = element.style.fontFamily;
    if(fontFamily === FontFamilyName) {
      return;
    }

    element.classList.add('is-markup');
    element.dataset.markup = fontFamily;
    setDirection(element);

    if(fontFamily.includes('quote')) {
      element.classList.add('quote-like', 'quote-like-icon', 'quote-like-border');
    }
  });

  (input.querySelectorAll('.is-markup') as NodeListOf<HTMLElement>).forEach((element) => {
    const fontFamily = element.style.fontFamily;
    if(fontFamily && fontFamily !== FontFamilyName) {
      return;
    }

    if(!fontFamily.includes('quote')) {
      element.classList.remove('quote-like', 'quote-like-icon', 'quote-like-border');
    }

    element.classList.remove('is-markup');
    delete element.dataset.markup;
  });
  // console.log('process formatting', performance.now() - perf);
}

export function resetCurrentFormatting() {
  return document.execCommand('removeFormat', false, null);
}

export function resetCurrentFontFormatting() {
  return document.execCommand('fontName', false, FontFamilyName);
}

export function handleMarkdownShortcut(input: HTMLElement, e: KeyboardEvent) {
  // console.log('handleMarkdownShortcut', e);
  const formatKeys: {[key: string]: MarkdownType} = {
    'KeyB': 'bold',
    'KeyI': 'italic',
    'KeyU': 'underline',
    'KeyS': 'strikethrough',
    'KeyM': 'monospace',
    'KeyP': 'spoiler'
  };

  if(true/* this.appImManager.markupTooltip */) {
    formatKeys['KeyK'] = 'link';
  }

  const code = e.code;
  const markdownType = formatKeys[code];

  const selection = document.getSelection();
  if(!isSelectionEmpty(selection) && markdownType) {
    // * костыльчик
    if(code === 'KeyK') {
      MarkupTooltip.getInstance().showLinkEditor();
    } else {
      applyMarkdown(input, markdownType);
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
