/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import { MessageEntity } from "../layer";
import RichTextProcessor from "../lib/richtextprocessor";
import ListenerSetter from "./listenerSetter";
import { isTouchSupported } from "./touchSupport";
import { isApple, isMobileSafari } from "./userAgent";
import rootScope from "../lib/rootScope";
import { MOUNT_CLASS_TO } from "../config/debug";
import { doubleRaf } from "./schedulers";

/* export function isInDOM(element: Element, parentNode?: HTMLElement): boolean {
  if(!element) {
    return false;
  }

  parentNode = parentNode || document.body;
  if(element === parentNode) {
    return true;
  }
  return isInDOM(element.parentNode as HTMLElement, parentNode);
} */
export function isInDOM(element: Element): boolean {
  return element?.isConnected;
}

/* export function checkDragEvent(e: any) {
  if(!e || e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'A')) return false
  if(e.dataTransfer && e.dataTransfer.types) {
    for(var i = 0; i < e.dataTransfer.types.length; i++) {
      if(e.dataTransfer.types[i] === 'Files') {
        return true;
      }
    }
  } else {
    return true;
  }

  return false;
} */

export function cancelEvent(event: Event) {
  event = event || window.event;
  if(event) {
    // @ts-ignore
    event = event.originalEvent || event;

    try {
      if(event.stopPropagation) event.stopPropagation();
      if(event.preventDefault) event.preventDefault();
      event.returnValue = false;
      event.cancelBubble = true;
    } catch(err) {}
  }

  return false;
}

export function placeCaretAtEnd(el: HTMLElement) {
  if(isTouchSupported) {
    return;
  }
  
  el.focus();
  if(typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // @ts-ignore
  } else if(typeof document.body.createTextRange !== "undefined") {
    // @ts-ignore
    var textRange = document.body.createTextRange();
    textRange.moveToElementText(el);
    textRange.collapse(false);
    textRange.select();
  }
}

/* export function getFieldSelection(field: any) {
  if(field.selectionStart) {
    return field.selectionStart;
  // @ts-ignore
  } else if(!document.selection) {
    return 0;
  }

  const c = '\x01';
  // @ts-ignore
  const sel = document.selection.createRange();
  const txt = sel.text;
  const dup = sel.duplicate();
  let len = 0;

  try {
    dup.moveToElementText(field);
  } catch(e) {
    return 0;
  }

  sel.text = txt + c;
  len = dup.text.indexOf(c);
  sel.moveStart('character', -1);
  sel.text = '';

  // if (browser.msie && len === -1) {
  //   return field.value.length
  // }
  return len;
} */

export function getRichValue(field: HTMLElement, entities?: MessageEntity[]) {
  if(!field) {
    return '';
  }

  const lines: string[] = [];
  const line: string[] = [];

  getRichElementValue(field, lines, line, undefined, undefined, entities);
  if(line.length) {
    lines.push(line.join(''));
  }

  let value = lines.join('\n');
  value = value.replace(/\u00A0/g, ' ');

  if(entities) {
    RichTextProcessor.combineSameEntities(entities);
  }

  //console.log('getRichValue:', value, entities);

  return value;
}

MOUNT_CLASS_TO.getRichValue = getRichValue;

export type MarkdownType = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'monospace' | 'link';
export type MarkdownTag = {
  match: string,
  entityName: 'messageEntityBold' | 'messageEntityUnderline' | 'messageEntityItalic' | 'messageEntityPre' | 'messageEntityStrike' | 'messageEntityTextUrl';
};
export const markdownTags: {[type in MarkdownType]: MarkdownTag} = {
  bold: {
    match: '[style*="font-weight"], b',
    entityName: 'messageEntityBold'
  },
  underline: {
    match: '[style*="underline"], u',
    entityName: 'messageEntityUnderline'
  },
  italic: {
    match: '[style*="italic"], i',
    entityName: 'messageEntityItalic'
  },
  monospace: {
    match: '[style*="monospace"], [face="monospace"]',
    entityName: 'messageEntityPre'
  },
  strikethrough: {
    match: '[style*="line-through"], strike',
    entityName: 'messageEntityStrike'
  },
  link: {
    match: 'A',
    entityName: 'messageEntityTextUrl'
  }
};
export function getRichElementValue(node: HTMLElement, lines: string[], line: string[], selNode?: Node, selOffset?: number, entities?: MessageEntity[], offset = {offset: 0}) {
  if(node.nodeType === 3) { // TEXT
    if(selNode === node) {
      const value = node.nodeValue;
      line.push(value.substr(0, selOffset) + '\x01' + value.substr(selOffset));
    } else {
      const nodeValue = node.nodeValue;
      line.push(nodeValue);

      if(entities && nodeValue.trim()) {
        if(node.parentNode) {
          const parentElement = node.parentElement;
          
          for(const type in markdownTags) {
            const tag = markdownTags[type as MarkdownType];
            const closest = parentElement.closest(tag.match + ', [contenteditable]');
            if(closest && closest.getAttribute('contenteditable') === null) {
              if(tag.entityName === 'messageEntityTextUrl') {
                entities.push({
                  _: tag.entityName as any,
                  url: (parentElement as HTMLAnchorElement).href,
                  offset: offset.offset,
                  length: nodeValue.length
                });
              } else {
                entities.push({
                  _: tag.entityName as any,
                  offset: offset.offset,
                  length: nodeValue.length
                });
              }
            }
          }
        }
      }

      offset.offset += nodeValue.length;
    }

    return;
  }

  if(node.nodeType !== 1) { // NON-ELEMENT
    return;
  }

  const isSelected = (selNode === node);
  const isBlock = node.tagName === 'DIV' || node.tagName === 'P';
  if(isBlock && line.length || node.tagName === 'BR') {
    lines.push(line.join(''));
    line.splice(0, line.length);
  } else if(node.tagName === 'IMG') {
    const alt = (node as HTMLImageElement).alt;
    if(alt) {
      line.push(alt);
      offset.offset += alt.length;
    }
  }

  if(isSelected && !selOffset) {
    line.push('\x01');
  }

  let curChild = node.firstChild as HTMLElement;
  while(curChild) {
    getRichElementValue(curChild, lines, line, selNode, selOffset, entities, offset);
    curChild = curChild.nextSibling as any;
  }

  if(isSelected && selOffset) {
    line.push('\x01');
  }

  if(isBlock && line.length) {
    lines.push(line.join(''));
    line.splice(0, line.length);
  }
}

export function isInputEmpty(element: HTMLElement) {
  if(element.hasAttribute('contenteditable') || element.tagName !== 'INPUT') {
    /* const value = element.innerText;

    return !value.trim() && !serializeNodes(Array.from(element.childNodes)).trim(); */
    return !getRichValue(element).trim();
  } else {
    return !(element as HTMLInputElement).value.trim();
  }
}

/* export function serializeNodes(nodes: Node[]): string {
  return nodes.reduce((str, child: any) => {
    //console.log('childNode', str, child, typeof(child), typeof(child) === 'string', child.innerText);

    if(typeof(child) === 'object' && child.textContent) return str += child.textContent;
    if(child.innerText) return str += child.innerText;
    if(child.tagName === 'IMG' && child.classList && child.classList.contains('emoji')) return str += child.getAttribute('alt');

    return str;
  }, '');
} */

/* if (Config.Modes.animations &&
  typeof window.requestAnimationFrame === 'function') {
  window.onAnimationFrameCallback = function (cb) {
    return (function () {
      window.requestAnimationFrame(cb)
    })
  }
} else {
  window.onAnimationFrameCallback = function (cb) {
    return cb
  }
} */

// generate a path's arc data parameter
// http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands
var arcParameter = function(rx: number, ry: number, xAxisRotation: number, largeArcFlag: number, sweepFlag: number, x: number, y: number) {
  return [rx, ',', ry, ' ',
          xAxisRotation, ' ',
          largeArcFlag, ',',
          sweepFlag, ' ',
          x, ',', y ].join('');
};

export function generatePathData(x: number, y: number, width: number, height: number, tl: number, tr: number, br: number, bl: number) {
  const data: string[] = [];

  // start point in top-middle of the rectangle
  data.push('M' + (x + width / 2) + ',' + y);

  // next we go to the right
  data.push('H' + (x + width - tr));

  if(tr > 0) {
    // now we draw the arc in the top-right corner
    data.push('A' + arcParameter(tr, tr, 0, 0, 1, (x + width), (y + tr)));
  }

  // next we go down
  data.push('V' + (y + height - br));

  if(br > 0) {
    // now we draw the arc in the lower-right corner
    data.push('A' + arcParameter(br, br, 0, 0, 1, (x + width - br), (y + height)));
  }

  // now we go to the left
  data.push('H' + (x + bl));

  if(bl > 0) {
    // now we draw the arc in the lower-left corner
    data.push('A' + arcParameter(bl, bl, 0, 0, 1, (x + 0), (y + height - bl)));
  }

  // next we go up
  data.push('V' + (y + tl));

  if(tl > 0) {
    // now we draw the arc in the top-left corner
    data.push('A' + arcParameter(tl, tl, 0, 0, 1, (x + tl), (y + 0)));
  }

  // and we close the path
  data.push('Z');

  return data.join(' ');
};

MOUNT_CLASS_TO.generatePathData = generatePathData;

export function whichChild(elem: Node) {
  if(!elem.parentNode) {
    return -1;
  }
  
  let i = 0;
  // @ts-ignore
  while((elem = elem.previousElementSibling) !== null) ++i;
  return i;
};

export function fillPropertyValue(str: string) {
  let splitted = str.split(' ');
  if(splitted.length !== 4) {
    if(!splitted[0]) splitted[0] = '0px';
    for(let i = splitted.length; i < 4; ++i) {
      splitted[i] = splitted[i % 2] || splitted[0] || '0px';
    }
  }

  return splitted;
}

export function calcImageInBox(imageW: number, imageH: number, boxW: number, boxH: number, noZoom = true) {
  if(imageW < boxW && imageH < boxH && noZoom) {
    return {w: imageW, h: imageH};
  }

  let boxedImageW = boxW;
  let boxedImageH = boxH;

  if((imageW / imageH) > (boxW / boxH)) {
    boxedImageH = (imageH * boxW / imageW) | 0;
  } else {
    boxedImageW = (imageW * boxH / imageH) | 0;
    if(boxedImageW > boxW) {
      boxedImageH = (boxedImageH * boxW / boxedImageW) | 0;
      boxedImageW = boxW;
    }
  }

  // if (Config.Navigator.retina) {
  //   imageW = Math.floor(imageW / 2)
  //   imageH = Math.floor(imageH / 2)
  // }

  if(noZoom && boxedImageW >= imageW && boxedImageH >= imageH) {
    boxedImageW = imageW;
    boxedImageH = imageH;
  }

  return {w: boxedImageW, h: boxedImageH};
}

MOUNT_CLASS_TO.calcImageInBox = calcImageInBox;

export function positionElementByIndex(element: HTMLElement, container: HTMLElement, pos: number, prevPos?: number) {
  if(prevPos === undefined) {
    prevPos = element.parentElement === container ? whichChild(element) : -1;
  }

  if(prevPos === pos) {
    return false;
  } else if(prevPos !== -1 && prevPos < pos) { // was higher
    pos += 1;
  }

  if(container.childElementCount > pos) {
    container.insertBefore(element, container.children[pos]);
  } else {
    container.append(element);
  }

  return true;
}

export function cancelSelection() {
  if(window.getSelection) {
    if(window.getSelection().empty) {  // Chrome
      window.getSelection().empty();
    } else if(window.getSelection().removeAllRanges) {  // Firefox
      window.getSelection().removeAllRanges();
    }
    // @ts-ignore
  } else if(document.selection) {  // IE?
    // @ts-ignore
    document.selection.empty();
  }
}

//(window as any).splitStringByLength = splitStringByLength;

export function getSelectedText(): string {
  if(window.getSelection) {
    return window.getSelection().toString();
    // @ts-ignore
  } else if(document.selection) {
    // @ts-ignore
    return document.selection.createRange().text;
  }
  
  return '';
}

export function blurActiveElement() {
  if(document.activeElement && (document.activeElement as HTMLInputElement).blur) {
    (document.activeElement as HTMLInputElement).blur();
    return true;
  }

  return false;
}

export const CLICK_EVENT_NAME: 'mousedown' | 'touchend' | 'click' = (isTouchSupported ? 'mousedown' : 'click') as any;
export type AttachClickOptions = AddEventListenerOptions & Partial<{listenerSetter: ListenerSetter, touchMouseDown: true}>;
export const attachClickEvent = (elem: HTMLElement, callback: (e: TouchEvent | MouseEvent) => void, options: AttachClickOptions = {}) => {
  const add = options.listenerSetter ? options.listenerSetter.add.bind(options.listenerSetter, elem) : elem.addEventListener.bind(elem);
  const remove = options.listenerSetter ? options.listenerSetter.removeManual.bind(options.listenerSetter, elem) : elem.removeEventListener.bind(elem);

  options.touchMouseDown = true;
  /* if(options.touchMouseDown && CLICK_EVENT_NAME === 'touchend') {
    add('mousedown', callback, options);
  } else if(CLICK_EVENT_NAME === 'touchend') {
    const o = {...options, once: true};

    const onTouchStart = (e: TouchEvent) => {
      const onTouchMove = (e: TouchEvent) => {
        remove('touchmove', onTouchMove, o);
        remove('touchend', onTouchEnd, o);
      };
  
      const onTouchEnd = (e: TouchEvent) => {
        remove('touchmove', onTouchMove, o);
        callback(e);
        if(options.once) {
          remove('touchstart', onTouchStart);
        }
      };
  
      add('touchend', onTouchEnd, o);
      add('touchmove', onTouchMove, o);
    };

    add('touchstart', onTouchStart);
  } else {
    add(CLICK_EVENT_NAME, callback, options);
  } */
  add(CLICK_EVENT_NAME, callback, options);
};

export const detachClickEvent = (elem: HTMLElement, callback: (e: TouchEvent | MouseEvent) => void, options?: AddEventListenerOptions) => {
  if(CLICK_EVENT_NAME === 'touchend') {
    elem.removeEventListener('touchstart', callback, options);
  } else {
    elem.removeEventListener(CLICK_EVENT_NAME, callback, options);
  }
};

export const getSelectedNodes = () => {
  const nodes: Node[] = [];
  const selection = window.getSelection();
  for(let i = 0; i < selection.rangeCount; ++i) {
    const range = selection.getRangeAt(i);
    let {startContainer, endContainer} = range;
    if(endContainer.nodeType !== 3) endContainer = endContainer.firstChild;
    
    while(startContainer && startContainer !== endContainer) {
      nodes.push(startContainer.nodeType === 3 ? startContainer : startContainer.firstChild);
      startContainer = startContainer.nextSibling;
    }
    
    if(nodes[nodes.length - 1] !== endContainer) {
      nodes.push(endContainer);
    }
  }

  // * filter null's due to <br>
  return nodes.filter(node => !!node);
};

/* export const isSelectionSingle = (input: Element = document.activeElement) => {
  const nodes = getSelectedNodes();
  const parents = [...new Set(nodes.map(node => node.parentNode))];
  const differentParents = parents.length > 1;

  let single = true;
  if(differentParents) {
    single = false;
  } else {
    const node = nodes[0];
    if(node && node.parentNode !== input && node.parentNode.parentNode !== input) {
      single = false;
    }
  }

  return single;
}; */

export const handleScrollSideEvent = (elem: HTMLElement, side: 'top' | 'bottom', callback: () => void, listenerSetter: ListenerSetter) => {
  if(isTouchSupported) {
    let lastY: number;
    const options = {passive: true};
    listenerSetter.add(elem, 'touchstart', (e) => {
      if(e.touches.length > 1) {
        onTouchEnd();
        return;
      }

      lastY = e.touches[0].clientY;

      listenerSetter.add(elem, 'touchmove', onTouchMove, options);
      listenerSetter.add(elem, 'touchend', onTouchEnd, options);
    }, options);

    const onTouchMove = (e: TouchEvent) => {
      const clientY = e.touches[0].clientY;

      const isDown = clientY < lastY;
      if(side === 'bottom' && isDown) callback();
      else if(side === 'top' && !isDown) callback();
      lastY = clientY;
      //alert('isDown: ' + !!isDown);
    };
    
    const onTouchEnd = () => {
      listenerSetter.removeManual(elem, 'touchmove', onTouchMove, options);
      listenerSetter.removeManual(elem, 'touchend', onTouchEnd, options);
    };
  } else {
    listenerSetter.add(elem, 'wheel', (e) => {
      const isDown = e.deltaY > 0;
      //this.log('wheel', e, isDown);
      if(side === 'bottom' && isDown) callback();
      else if(side === 'top' && !isDown) callback();
    }, {passive: true});
  }
};

/* export function radiosHandleChange(inputs: HTMLInputElement[], onChange: (value: string) => void) {
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      if(input.checked) {
        onChange(input.value);
      }
    });
  });
} */

export function isSendShortcutPressed(e: KeyboardEvent) {
  if(e.key === 'Enter' && !isTouchSupported) {
    /* if(e.ctrlKey || e.metaKey) {
      this.messageInput.innerHTML += '<br>';
      placeCaretAtEnd(this.message)
      return;
    } */

    if(rootScope.settings.sendShortcut === 'enter') {
      if(e.shiftKey || e.ctrlKey || e.metaKey) {
        return;
      }

      return true;
    } else {
      const secondaryKey = isApple ? e.metaKey : e.ctrlKey;
      if(e.shiftKey || (isApple ? e.ctrlKey : e.metaKey)) {
        return;
      }

      if(secondaryKey) {
        return true;
      }
    }
  }

  return false;
}

export function reflowScrollableElement(element: HTMLElement) {
  element.style.display = 'none';
  void element.offsetLeft; // reflow
  element.style.display = '';
}

export function isSelectionEmpty(selection = window.getSelection()) {
  if(!selection || !selection.rangeCount) {
    return true;
  }

  const selectionRange = selection.getRangeAt(0);
  if(!selectionRange.toString() || !selectionRange.START_TO_END) {
    return true;
  }

  return false;
}

export function disableTransition(elements: HTMLElement[]) {
  elements.forEach(el => el.classList.add('no-transition'));

  doubleRaf().then(() => {
    elements.forEach(el => el.classList.remove('no-transition'));
  });
}

export function toggleDisability(elements: HTMLElement[], disable: boolean) {
  if(disable) {
    elements.forEach(el => el.setAttribute('disabled', 'true'));
  } else {
    elements.forEach(el => el.removeAttribute('disabled'));
  }

  return () => toggleDisability(elements, !disable);
}

export function canFocus(isFirstInput: boolean) {
  return !isMobileSafari || !isFirstInput;
}

export function htmlToDocumentFragment(html: string) {
  var template = document.createElement('template');
  html = html.trim(); // Never return a text node of whitespace as the result
  template.innerHTML = html;
  return template.content;
}

export function htmlToSpan(html: string) {
  const span = document.createElement('span');
  span.innerHTML = html;
  return span;
}

export function replaceContent(elem: HTMLElement, node: string | Node) {
  // * children.length doesn't count text nodes
  if(elem.children.length) {
    elem.firstChild.replaceWith(node);
  } else if(!elem.firstChild) {
    elem.append(node);
  } else {
    elem.textContent = '';
    elem.append(node);
  }
}
