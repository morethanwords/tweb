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
import RichTextProcessor from "../../lib/richtextprocessor";
import getRichElementValue from "./getRichElementValue";

export default function getRichValueWithCaret(field: HTMLElement, withEntities = true) {
  const lines: string[] = [];
  const line: string[] = [];

  const sel = window.getSelection();
  let selNode: Node;
  let selOffset: number;
  if(sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    if(range.startContainer &&
      range.startContainer == range.endContainer &&
      range.startOffset == range.endOffset) {
      selNode = range.startContainer;
      selOffset = range.startOffset;
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
    RichTextProcessor.combineSameEntities(entities);
  }

  return {value, entities, caretPos};
}
