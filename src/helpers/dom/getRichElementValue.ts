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

export default function getRichElementValue(node: HTMLElement, lines: string[], line: string[], selNode?: Node, selOffset?: number, entities?: MessageEntity[], offset = {offset: 0}) {
  if(node.nodeType === 3) { // TEXT
    const nodeValue = node.nodeValue;

    if(selNode === node) {
      line.push(nodeValue.substr(0, selOffset) + '\x01' + nodeValue.substr(selOffset));
    } else {
      line.push(nodeValue);
    }

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
