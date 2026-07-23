/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '@environment/touchSupport';

export default function placeCaretAtEnd(el: HTMLElement, ignoreTouchCheck = false, focus = true) {
  const activeElement = el.ownerDocument.activeElement;
  if(IS_TOUCH_SUPPORTED && (!ignoreTouchCheck || (activeElement.tagName !== 'INPUT' && !(activeElement as HTMLElement).isContentEditable))) {
    return;
  }

  focus && el.focus();
  if(el instanceof HTMLInputElement) {
    const length = el.value.length;
    el.selectionStart = length;
    el.selectionEnd = length;
  } else {
    const view = el.ownerDocument.defaultView;
    if(!view) return;

    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = view.getSelection();
    if(!sel) return;

    sel.removeAllRanges();
    sel.addRange(range);
  }
}

(window as any).placeCaretAtEnd = placeCaretAtEnd;
