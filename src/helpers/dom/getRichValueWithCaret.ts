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

import {MOUNT_CLASS_TO} from '../../config/debug';
import {MessageEntity} from '../../layer';
import combineSameEntities from '../../lib/richTextProcessor/combineSameEntities';
import findConflictingEntity, {SINGLE_ENTITIES} from '../../lib/richTextProcessor/findConflictingEntity';
import sortEntities from '../../lib/richTextProcessor/sortEntities';
import getRichElementValue, {SELECTION_SEPARATOR} from './getRichElementValue';

export function getCaretPos(field: Node) {
  const sel = window.getSelection();
  let selNode: Node;
  let selOffset: number;
  if(sel?.rangeCount) {
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

  return {node: selNode, offset: selOffset};
}

export default function getRichValueWithCaret(
  field: Node | HTMLElement | DocumentFragment,
  withEntities = true,
  withCaret = true
) {
  const lines: string[] = [];
  const line: string[] = [];

  const {node: selNode, offset: selOffset} = !(field instanceof DocumentFragment) && withCaret && getCaretPos(field);

  const entities: MessageEntity[] = withEntities ? [] : undefined;
  const offset = {offset: 0};
  if(field instanceof DocumentFragment) {
    let curChild = field.firstChild as HTMLElement;
    while(curChild) {
      getRichElementValue(curChild, lines, line, selNode, selOffset, entities, offset);
      curChild = curChild.nextSibling as any;
    }
  } else {
    getRichElementValue(field as HTMLElement, lines, line, selNode, selOffset, entities, offset);
  }

  if(line.length) {
    lines.push(line.join(''));
  }

  let value = lines.join('\n');
  const caretPos = value.indexOf(SELECTION_SEPARATOR);
  if(caretPos !== -1) {
    value = value.substr(0, caretPos) + value.substr(caretPos + 1);
  }
  value = value.replace(/\u00A0/g, ' ');

  if(entities?.length) {
    // ! cannot do that here because have the same check before the sending in RichTextProcessor.parseMarkdown
    /* const entity = entities[entities.length - 1];
    const length = value.length;
    const trimmedLength = value.trimRight().length;
    if(length !== trimmedLength) {
      entity.length -= length - trimmedLength;
    } */

    const single = entities.filter((entity) => SINGLE_ENTITIES.has(entity._));
    for(let i = 0; i < entities.length; ++i) {
      const entity = entities[i];
      if(SINGLE_ENTITIES.has(entity._)) {
        continue;
      }

      const conflictingEntity = findConflictingEntity(single, entity);
      if(!conflictingEntity) {
        continue;
      }

      entity.length = conflictingEntity.offset - entity.offset;
      if(entity.length <= 0) {
        entities.splice(i--, 1);
      }
    }

    combineSameEntities(entities);
    sortEntities(entities);
  }

  return {value, entities, caretPos};
}

MOUNT_CLASS_TO.getCaretPos = getCaretPos;
MOUNT_CLASS_TO.getRichValueWithCaret = getRichValueWithCaret;
