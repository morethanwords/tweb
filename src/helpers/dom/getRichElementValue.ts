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

import {MessageEntity} from '../../layer';
import BOM from '../string/bom';

export type MarkdownType = 'bold' | 'italic' | 'underline' | 'strikethrough' |
  'monospace' | 'link' | 'mentionName' | 'spoiler' | 'quote'/*  | 'customEmoji' */;
export type MarkdownTag = {
  match: string,
  entityName: Extract<
    MessageEntity['_'], 'messageEntityBold' | 'messageEntityUnderline' |
    'messageEntityItalic' | 'messageEntityCode' | 'messageEntityStrike' |
    'messageEntityTextUrl' | 'messageEntityMentionName' | 'messageEntitySpoiler' |
    'messageEntityBlockquote'/*  | 'messageEntityCustomEmoji' */
  >;
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
    match: '[style*="line-through"], [style*="strikethrough"], strike, del, s',
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
  },
  quote: {
    match: '[style*="quote"], .quote',
    entityName: 'messageEntityBlockquote'
  }
  // customEmoji: {
  //   match: '.custom-emoji',
  //   entityName: 'messageEntityCustomEmoji'
  // }
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

const BLOCK_TAGS = new Set([
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
  'TR',
  'OL',
  'UL',
  'BLOCKQUOTE'
]);

// const INSERT_NEW_LINE_TAGS = new Set([
//   'OL',
//   'UL'
// ]);

const BOM_REG_EXP = new RegExp(BOM, 'g');
export const SELECTION_SEPARATOR = '\x01';

function checkNodeForEntity(node: Node, value: string, entities: MessageEntity[], offset: {offset: number}) {
  const parentElement = node.parentElement;

  // let closestTag: MarkdownTag, closestElementByTag: Element, closestDepth = Infinity;
  for(const type in markdownTags) {
    const tag = markdownTags[type as MarkdownType];
    const closest: HTMLElement = parentElement.closest(tag.match + ', [contenteditable="true"]');
    if(closest?.getAttribute('contenteditable') !== null) {
      /* const depth = getDepth(closest, parentElement.closest('[contenteditable]'));
      if(closestDepth > depth) {
        closestDepth = depth;
        closestTag = tag;
        closestElementByTag = closest;
      } */
      continue;
    }

    let codeElement: HTMLElement;
    if(tag.entityName === 'messageEntityCode' && (codeElement = parentElement.closest('[data-language]'))) {
      entities.push({
        _: 'messageEntityPre',
        language: codeElement.dataset.language || '',
        offset: offset.offset,
        length: value.length
      });
    } else if(tag.entityName === 'messageEntityTextUrl') {
      entities.push({
        _: tag.entityName,
        url: (closest as HTMLAnchorElement).href,
        offset: offset.offset,
        length: value.length
      });
    } else if(tag.entityName === 'messageEntityMentionName') {
      entities.push({
        _: tag.entityName,
        offset: offset.offset,
        length: value.length,
        user_id: (closest as HTMLElement).dataset.follow.toUserId()
      });
    } else if(tag.entityName === 'messageEntityBlockquote') {
      entities.push({
        _: tag.entityName,
        pFlags: {
          collapsed: /* closest.classList.contains('can-send-collapsd') &&  */!!closest.dataset.collapsed || undefined
        },
        offset: offset.offset,
        length: value.length
      });
    } /*  else if(tag.entityName === 'messageEntityCustomEmoji') {
      entities.push({
        _: tag.entityName,
        document_id: (closest as HTMLElement).dataset.docId,
        offset: offset.offset,
        length: emoji.length
      });
    } */ else {
      entities.push({
        _: tag.entityName,
        offset: offset.offset,
        length: value.length
      });
    }
  }
}

function isLineEmpty(line: string[]) {
  const {length} = line;
  if(!length) {
    return true;
  }

  if(line[length - 1] === SELECTION_SEPARATOR && length === SELECTION_SEPARATOR.length) {
    return true;
  }

  return false;
}

export default function getRichElementValue(
  node: HTMLElement,
  lines: string[],
  line: string[],
  selNode?: Node,
  selOffset?: number,
  entities?: MessageEntity[],
  offset: {offset: number, isInQuote?: boolean} = {offset: 0}
) {
  if(node.nodeType === node.TEXT_NODE) { // TEXT
    let nodeValue = node.nodeValue;
    // if(nodeValue[0] === BOM) {
    nodeValue = nodeValue.replace(BOM_REG_EXP, '');
    // }

    /* const tabulation = node.parentElement?.closest(tabulationMatch + ', [contenteditable]');
    if(tabulation?.getAttribute('contenteditable') === null) {
      nodeValue += ' ';
      // line.push('\t');
      // ++offset.offset;
    } */

    if(nodeValue) {
      // if(offset.isInQuote && nodeValue.endsWith('\n')) { // slice last linebreak from quote
      //   nodeValue = nodeValue.slice(0, -1);
      // }

      if(selNode === node) {
        line.push(nodeValue.substr(0, selOffset) + SELECTION_SEPARATOR + nodeValue.substr(selOffset));
      } else {
        line.push(nodeValue);
      }
    } else if(selNode === node) {
      line.push(SELECTION_SEPARATOR);
    }

    if(entities && nodeValue.length && node.parentNode) {
      checkNodeForEntity(node, nodeValue, entities, offset);
    }

    offset.offset += nodeValue.length;
    return;
  }

  if(node.nodeType !== node.ELEMENT_NODE) { // NON-ELEMENT
    return;
  }

  const pushLine = () => {
    lines.push(line.join(''));
    line.length = 0;
    ++offset.offset;
  };

  const isSelected = selNode === node;
  const isQuote = node.matches(markdownTags.quote.match);
  const isBlock = BLOCK_TAGS.has(node.tagName) || isQuote;
  if(isBlock && ((line.length && line[line.length - 1].slice(-1) !== '\n') || node.tagName === 'BR'/*  || (BLOCK_TAGS.has(node.tagName) && lines.length) */)) {
    pushLine();
  } else {
    const alt = node.dataset.stickerEmoji || (node as HTMLImageElement).alt;
    const stickerEmoji = node.dataset.stickerEmoji;

    if(alt && entities) {
      checkNodeForEntity(node, alt, entities, offset);
    }

    if(stickerEmoji && entities) {
      entities.push({
        _: 'messageEntityCustomEmoji',
        document_id: node.dataset.docId,
        offset: offset.offset,
        length: alt.length
      });
    }

    if(alt) {
      line.push(alt);
      offset.offset += alt.length;
    }
  }

  if(isSelected && !selOffset) {
    line.push(SELECTION_SEPARATOR);
  }

  const isTableCell = node.matches(tabulationMatch);
  const wasEntitiesLength = entities?.length;
  // const wasLinesLength = lines.length;
  let wasNodeEmpty = true;

  if(isQuote) {
    offset.isInQuote = true;
  }

  let curChild = node.firstChild as HTMLElement;
  while(curChild) {
    getRichElementValue(curChild, lines, line, selNode, selOffset, entities, offset);
    curChild = curChild.nextSibling as any;

    if(!isLineEmpty(line)) {
      wasNodeEmpty = false;
    }
  }

  if(isQuote) {
    const lastValue = line[line.length - 1];
    if(lastValue?.endsWith('\n')) { // slice last linebreak from quote
      line[line.length - 1] = lastValue.slice(0, -1);
      offset.offset -= 1;
    }

    offset.isInQuote = false;
  }

  // can test on text with list (https://www.who.int/initiatives/sports-and-health)
  if(wasNodeEmpty && node.textContent?.replace(/[\r\n]/g, '')) {
    wasNodeEmpty = false;
  }

  if(isSelected && selOffset) {
    line.push(SELECTION_SEPARATOR);
  }

  if(isTableCell && node.nextSibling && !isLineEmpty(line)) {
    line.push(' ');
    ++offset.offset;

    // * combine entities such as url after adding space
    if(wasEntitiesLength !== undefined) {
      for(let i = wasEntitiesLength, length = entities.length; i < length; ++i) {
        ++entities[i].length;
      }
    }
  }

  if(isBlock && !wasNodeEmpty) {
    pushLine();
  }

  if(!wasNodeEmpty && node.tagName === 'P' && node.nextSibling) {
    lines.push('');
    ++offset.offset;
  }
}
