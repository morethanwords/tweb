/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatInputReplyTo} from '../../components/chat/input';
import {MessageEntity} from '../../layer';
import cancelSelection from './cancelSelection';
import findUpClassName from './findUpClassName';
import getRichValueWithCaret from './getRichValueWithCaret';

export default function getRichSelection(target: HTMLElement) {
  const selection = document.getSelection();
  const range = selection.getRangeAt(0);
  const {startContainer, startOffset, endContainer, endOffset} = range;
  const startValue = startContainer.nodeValue;
  const endValue = endContainer.nodeValue;

  // * find the index
  const needle = '\x02';
  const container = findUpClassName(target, 'spoilers-container');
  const skipSelectors: string[] = ['.reply'];
  const s = skipSelectors.map((selector) => {
    const element = container.querySelector(selector);
    if(element) {
      const textNode = document.createTextNode('');
      element.replaceWith(textNode);
      return [textNode, element];
    }
  }).filter(Boolean);

  let insertedStartNode: Text, insertedEndNode: Text;
  if(startValue === null) {
    startContainer.parentNode.insertBefore(
      insertedStartNode = document.createTextNode(needle),
      startOffset === 0 ? startContainer : startContainer.nextSibling
    );
  }

  if(endValue === null) {
    endContainer.parentNode.insertBefore(
      insertedEndNode = document.createTextNode(needle),
      endOffset === 0 ? endContainer : endContainer.nextSibling
    );
  }

  if(startContainer === endContainer && !insertedStartNode) {
    startContainer.nodeValue = startValue.slice(0, startOffset) + needle + startValue.slice(startOffset, endOffset) + needle + startValue.slice(endOffset);
  } else {
    if(!insertedEndNode) endContainer.nodeValue = endValue.slice(0, endOffset) + needle + endValue.slice(endOffset);
    if(!insertedStartNode) startContainer.nodeValue = startValue.slice(0, startOffset) + needle + startValue.slice(startOffset);
  }
  const {value: valueBefore} = getRichValueWithCaret(container);
  const startIndex = valueBefore.indexOf(needle);
  const endIndex = valueBefore.indexOf(needle, startIndex + 1) - 1;
  if(insertedStartNode) insertedStartNode.remove();
  else startContainer.nodeValue = startValue;
  if(insertedEndNode) insertedEndNode.remove();
  else endContainer.nodeValue = endValue;

  // * have to fix entities
  const SUPPORTED_ENTITIES = new Set<MessageEntity['_']>([
    'messageEntityBold',
    'messageEntityItalic',
    'messageEntityUnderline',
    'messageEntityStrike',
    'messageEntitySpoiler',
    'messageEntityCustomEmoji',
    'messageEntityEmoji'
  ]);
  const {value: valueAfter, entities} = getRichValueWithCaret(container, true);
  const value = valueAfter.slice(startIndex, endIndex);
  for(let i = 0; i < entities.length; ++i) {
    const entity = entities[i];
    const startOffset = entity.offset;
    const endOffset = startOffset + entity.length;
    if(endOffset < startIndex || startOffset >= endIndex || !SUPPORTED_ENTITIES.has(entity._)) {
      entities.splice(i--, 1);
      continue;
    }

    entity.offset = Math.max(startOffset - startIndex, 0);
    const distance = Math.max(startIndex - startOffset, 0);
    const maxLength = endIndex - startIndex - entity.offset;
    entity.length = Math.min(entity.length - distance, maxLength);
  }

  s.forEach(([textNode, element]) => textNode.replaceWith(element));
  cancelSelection();

  const quote: ChatInputReplyTo['replyToQuote'] = {
    text: value,
    entities: entities.length ? entities : undefined,
    offset: startIndex
  };

  return quote;
}
