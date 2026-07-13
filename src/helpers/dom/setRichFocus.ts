/*
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

  if(field.ownerDocument.defaultView.getSelection && field.ownerDocument.createRange) {
    const range = field.ownerDocument.createRange();
    if(selectNode) {
      range.selectNode(selectNode);
    } else {
      range.selectNodeContents(field);
    }

    if(!noCollapse) {
      range.collapse(false);
    }

    const sel = field.ownerDocument.defaultView.getSelection();
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
