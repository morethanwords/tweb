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

export default function setRichFocus(field: HTMLElement, selectNode: Node, noCollapse?: boolean) {
  field.focus();
  if(selectNode &&
    selectNode.parentNode == field &&
    !selectNode.nextSibling &&
    !noCollapse) {
    field.removeChild(selectNode);
    selectNode = null;
  }

  if(window.getSelection && document.createRange) {
    const range = document.createRange();
    if(selectNode) {
      range.selectNode(selectNode);
    } else {
      range.selectNodeContents(field);
    }

    if(!noCollapse) {
      range.collapse(false);
    }

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  /* else if (document.body.createTextRange !== undefined) {
    var textRange = document.body.createTextRange()
    textRange.moveToElementText(selectNode || field)
    if (!noCollapse) {
      textRange.collapse(false)
    }
    textRange.select()
  } */
}
