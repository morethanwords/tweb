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

import { MessageEntity } from "../../layer";
import combineSameEntities from "../../lib/richTextProcessor/combineSameEntities";
import getRichElementValue from "./getRichElementValue";

export default function getRichValueWithCaret(field: HTMLElement, withEntities = true) {
  const lines: string[] = [];
  const line: string[] = [];

  const sel = window.getSelection();
  let selNode: Node;
  let selOffset: number;
  if(sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const startOffset = range.startOffset;
    if(
      range.startContainer &&
      range.startContainer == range.endContainer &&
      startOffset == range.endOffset
    ) {
      // * if focused on img, or caret has been set via placeCaretAtEnd
      const possibleChildrenFocusOffset = startOffset - 1;
      const childNodes = field.childNodes;
      if(range.startContainer === field && childNodes[possibleChildrenFocusOffset]) {
        selNode = childNodes[possibleChildrenFocusOffset];
        selOffset = 0;

        for(let i = 0; i < range.endOffset; ++i) {
          const node = childNodes[i];
          const value = node.nodeValue || (node as HTMLImageElement).alt;

          if(value) {
            selOffset += value.length;
          }
        }
      } else {
        selNode = range.startContainer;
        selOffset = startOffset;
      }
    }
  }

  const entities: MessageEntity[] = withEntities ? [] : undefined;
  getRichElementValue(field, lines, line, selNode, selOffset, entities);

  if(line.length) {
    lines.push(line.join(''));
  }

  let value = lines.join('\n');
  const caretPos = value.indexOf('\x01');
  if(caretPos != -1) {
    value = value.substr(0, caretPos) + value.substr(caretPos + 1);
  }
  value = value.replace(/\u00A0/g, ' ');

  if(entities) {
    combineSameEntities(entities);
  }

  return {value, entities, caretPos};
}
