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

export type MarkdownType = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'monospace' | 'link' | 'mentionName' | 'spoiler';
export type MarkdownTag = {
  match: string,
  entityName: Extract<MessageEntity['_'], 'messageEntityBold' | 'messageEntityUnderline' | 'messageEntityItalic' | 'messageEntityCode' | 'messageEntityStrike' | 'messageEntityTextUrl' | 'messageEntityMentionName' | 'messageEntitySpoiler'>;
};

// https://core.telegram.org/bots/api#html-style
export const markdownTags: {[type in MarkdownType]: MarkdownTag} = {
  bold: {
    match: '[style*="bold"], [style*="font-weight: 700"], [style*="font-weight: 600"], [style*="font-weight:700"], [style*="font-weight:600"], b, strong',
    entityName: 'messageEntityBold'
  },
  underline: {
    match: '[style*="underline"], u, ins',
    entityName: 'messageEntityUnderline'
  },
  italic: {
    match: '[style*="italic"], i, em',
    entityName: 'messageEntityItalic'
  },
  monospace: {
    match: '[style*="monospace"], [face*="monospace"], pre',
    entityName: 'messageEntityCode'
  },
  strikethrough: {
    match: '[style*="line-through"], strike, del, s',
    entityName: 'messageEntityStrike'
  },
  link: {
    match: 'A:not(.follow)',
    entityName: 'messageEntityTextUrl'
  },
  mentionName: {
    match: 'A.follow',
    entityName: 'messageEntityMentionName'
  },
  spoiler: {
    match: '[style*="spoiler"]',
    entityName: 'messageEntitySpoiler'
  }
};

const tabulationMatch = '[style*="table-cell"], th, td';

/* export function getDepth(child: Node, container?: Node) {
  let depth = 0;

  do {
    if(child === container) {
      return depth;
    }

    ++depth;
  } while((child = child.parentNode) !== null);

  return depth;
} */

const BLOCK_TAG_NAMES = new Set([
  'DIV',
  'P',
  'BR',
  'LI',
  'SECTION',
  'H6',
  'H5',
  'H4',
  'H3',
  'H2',
  'H1',
  'TR'
]);

export default function getRichElementValue(node: HTMLElement, lines: string[], line: string[], selNode?: Node, selOffset?: number, entities?: MessageEntity[], offset = {offset: 0}) {
  if(node.nodeType === 3) { // TEXT
    let nodeValue = node.nodeValue;

    /* const tabulation = node.parentElement?.closest(tabulationMatch + ', [contenteditable]');
    if(tabulation?.getAttribute('contenteditable') === null) {
      nodeValue += ' ';
      // line.push('\t');
      // ++offset.offset;
    } */

    if(selNode === node) {
      line.push(nodeValue.substr(0, selOffset) + '\x01' + nodeValue.substr(selOffset));
    } else {
      line.push(nodeValue);
    }

    if(entities && nodeValue.length) {
      if(node.parentNode) {
        const parentElement = node.parentElement;
        
        // let closestTag: MarkdownTag, closestElementByTag: Element, closestDepth = Infinity;
        for(const type in markdownTags) {
          const tag = markdownTags[type as MarkdownType];
          const closest = parentElement.closest(tag.match + ', [contenteditable]');
          if(closest?.getAttribute('contenteditable') !== null) {
            /* const depth = getDepth(closest, parentElement.closest('[contenteditable]'));
            if(closestDepth > depth) {
              closestDepth = depth;
              closestTag = tag;
              closestElementByTag = closest;
            } */
            continue;
          }

          if(tag.entityName === 'messageEntityTextUrl') {
            entities.push({
              _: tag.entityName,
              url: (closest as HTMLAnchorElement).href,
              offset: offset.offset,
              length: nodeValue.length
            });
          } else if(tag.entityName === 'messageEntityMentionName') {
            entities.push({
              _: tag.entityName,
              offset: offset.offset,
              length: nodeValue.length,
              user_id: (closest as HTMLElement).dataset.follow.toUserId()
            });
          } else {
            entities.push({
              _: tag.entityName,
              offset: offset.offset,
              length: nodeValue.length
            });
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

  const isSelected = selNode === node;
  const isBlock = BLOCK_TAG_NAMES.has(node.tagName);
  if(isBlock && line.length) {
    lines.push(line.join(''));
    line.splice(0, line.length);
    ++offset.offset;
  } else if(node instanceof HTMLImageElement) {
    const alt = node.alt;
    if(alt) {
      line.push(alt);
      offset.offset += alt.length;
    }
  }

  if(isSelected && !selOffset) {
    line.push('\x01');
  }

  const isTableCell = node.matches(tabulationMatch);
  const wasEntitiesLength = entities?.length;

  let curChild = node.firstChild as HTMLElement;
  while(curChild) {
    getRichElementValue(curChild, lines, line, selNode, selOffset, entities, offset);
    curChild = curChild.nextSibling as any;
  }

  if(isSelected && selOffset) {
    line.push('\x01');
  }

  if(isTableCell && node.nextSibling) {
    line.push(' ');
    ++offset.offset;

    // * combine entities such as url after adding space
    if(wasEntitiesLength !== undefined) {
      for(let i = wasEntitiesLength, length = entities.length; i < length; ++i) {
        ++entities[i].length;
      }
    }
  }

  const wasLength = line.length;
  if(isBlock && wasLength) {
    lines.push(line.join(''));
    line.splice(0, wasLength);
    ++offset.offset;
  }

  if(wasLength && node.tagName === 'P' && node.nextSibling) {
    lines.push('');
    ++offset.offset;
  }
}
