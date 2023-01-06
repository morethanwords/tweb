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

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';

export default function placeCaretAtEnd(el: HTMLElement, ignoreTouchCheck = false, focus = true) {
  if(IS_TOUCH_SUPPORTED && (!ignoreTouchCheck || (document.activeElement.tagName !== 'INPUT' && !(document.activeElement as HTMLElement).isContentEditable))) {
    return;
  }

  focus && el.focus();
  if(el instanceof HTMLInputElement) {
    const length = el.value.length;
    el.selectionStart = length;
    el.selectionEnd = length;
  } else {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

(window as any).placeCaretAtEnd = placeCaretAtEnd;
