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

import {MessageEntity} from '@layer';
import matchUrlProtocol from '@lib/richTextProcessor/matchUrlProtocol';
import {BOM_REG_EXP} from '@helpers/string/bom';
import {ENTITY_ELEMENT_MAP} from '@lib/richTextProcessor/wrapRichText';

export type MarkdownType = 'bold' | 'italic' | 'underline' | 'strikethrough' |
  'monospace' | 'link' | 'mentionName' | 'spoiler' | 'quote' | 'date'/*  | 'customEmoji' */;
export type MarkdownTag = {
  match: string,
  entityName: Extract<
    MessageEntity['_'], 'messageEntityBold' | 'messageEntityUnderline' |
    'messageEntityItalic' | 'messageEntityCode' | 'messageEntityStrike' |
    'messageEntityTextUrl' | 'messageEntityMentionName' | 'messageEntitySpoiler' |
    'messageEntityBlockquote' | 'messageEntityFormattedDate'/*  | 'messageEntityCustomEmoji' */
  >;
};

function join(...arr: string[]) {
  return arr.join(', ');
}

// https://core.telegram.org/bots/api#html-style
export const markdownTags: {[type in MarkdownType]: MarkdownTag} = {
  bold: {
    match: join(
      '[style*="bold"]',
      '[style*="font-weight: 700"]',
      '[style*="font-weight: 600"]',
      '[style*="font-weight:700"]',
      '[style*="font-weight:600"]',
      'b',
      'strong',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6'
    ),
    entityName: 'messageEntityBold'
  },
  underline: {
    match: join('[style*="underline"]', 'u', 'ins'),
    entityName: 'messageEntityUnderline'
  },
  italic: {
    match: join('[style*="italic"]', 'i', 'em'),
    entityName: 'messageEntityItalic'
  },
  monospace: {
    match: join('[style*="monospace"]', '[face*="monospace"]', 'pre'),
    entityName: 'messageEntityCode'
  },
  strikethrough: {
    match: join(
      '[style*="line-through"]',
      '[style*="strikethrough"]',
      'strike',
      'del',
      's'
    ),
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
    match: join('[style*="quote"]', '.quote'),
    entityName: 'messageEntityBlockquote'
  },
  date: {
    match: join('[style*="date"]', '.formatted-date'),
    entityName: 'messageEntityFormattedDate'
  }
  // customEmoji: {
  //   match: '.custom-emoji',
  //   entityName: 'messageEntityCustomEmoji'
  // }
};

const tabulationMatch = join('[style*="table-cell"]', 'th', 'td');

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

export const SELECTION_SEPARATOR = '\x01';

export function getFormattedDateEntityByElement(
  element: HTMLElement,
  offset: number,
  length: number
): MessageEntity.messageEntityFormattedDate {
  const dateStr = element.dataset.date;
  const date = dateStr ? +dateStr : undefined;
  return {
    _: 'messageEntityFormattedDate',
    pFlags: {},
    date: 0,
    ...((ENTITY_ELEMENT_MAP.get(element) as MessageEntity.messageEntityFormattedDate) || {}),
    ...(date ? {date} : {}),
    offset,
    length
  };
}

function pushEntity(entities: MessageEntity[], entity: MessageEntity) {
  entities.push(entity);
  return entity;
}

function checkElementForEntity(
  element: HTMLElement,
  value: string,
  entities: MessageEntity[],
  offset: {offset: number},
  line: string[],
  currentEntities: {[_ in MessageEntity['_']]?: MessageEntity}
) {
  // let closestTag: MarkdownTag, closestElementByTag: Element, closestDepth = Infinity;
  for(const type in markdownTags) {
    const tag = markdownTags[type as MarkdownType];
    const closest: HTMLElement = element.closest(tag.match + ', [contenteditable="true"]');
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
    if(tag.entityName === 'messageEntityCode' && (codeElement = element.closest('[data-language]'))) {
      (currentEntities[tag.entityName] ||= pushEntity(entities, {
        _: 'messageEntityPre',
        language: codeElement.dataset.language || '',
        offset: offset.offset,
        length: 0
      })).length += value.length;
    } else if(tag.entityName === 'messageEntityTextUrl') {
      if(!value) {
        continue;
      }

      let entity = currentEntities[tag.entityName];
      if(!entity) {
        let good = false;
        try {
          const url1 = new URL((closest as HTMLAnchorElement).href);
          const url1String = url1.toString();
          const isRealUrl = url1.protocol === 'http:' || url1.protocol === 'https:';
          if(!isRealUrl) {
            throw 1;
          }

          let url2Before = value;
          if(!matchUrlProtocol(url2Before)) {
            url2Before = 'https://' + url2Before;
          }

          let url2: URL;
          let url2String: string;
          try {
            url2 = new URL(url2Before);
            url2String = url2.toString();
          } catch(err) {}

          const isSameUrl = url1String === url2String;
          good = !isSameUrl;
        } catch(err) {}

        good && (entity = currentEntities[tag.entityName] = pushEntity(entities, {
          _: tag.entityName,
          url: (closest as HTMLAnchorElement).href,
          offset: offset.offset,
          length: 0
        }));
      }

      if(entity) {
        entity.length += value.length;
      }
    } else if(tag.entityName === 'messageEntityMentionName') {
      (currentEntities[tag.entityName] ||= pushEntity(entities, {
        _: tag.entityName,
        offset: offset.offset,
        length: 0,
        user_id: (closest as HTMLElement).dataset.follow.toUserId()
      })).length += value.length;
    } else if(tag.entityName === 'messageEntityBlockquote') {
      (currentEntities[tag.entityName] ||= pushEntity(entities, {
        _: tag.entityName,
        pFlags: {
          collapsed: /* closest.classList.contains('can-send-collapsed') &&  */!!closest.dataset.collapsed || undefined
        },
        offset: offset.offset,
        length: 0
      })).length += value.length;
    } else if(tag.entityName === 'messageEntityFormattedDate') {
      if(!value) {
        continue;
      }

      const entity = getFormattedDateEntityByElement(closest, offset.offset, value.length);
      const {originalText, fakeText} = closest.dataset;
      if(originalText) { // * fix the text
        entity.length = originalText.length + value.length - fakeText.length; // * can have \x02 (quoting), calculating the difference
        offset.offset += originalText.length - fakeText.length;
        line[line.length - 1] = line[line.length - 1].replace(fakeText, originalText);
      }
      entities.push(entity);
    } /*  else if(tag.entityName === 'messageEntityCustomEmoji') {
      entities.push({
        _: tag.entityName,
        document_id: (closest as HTMLElement).dataset.docId,
        offset: offset.offset,
        length: emoji.length
      });
    } */ else {
      // * ignore local visible entities
      if(!(
        tag.entityName === 'messageEntityUnderline' &&
        closest.classList.contains('anchor-url') &&
        closest === element
      )) {
        (currentEntities[tag.entityName] ||= pushEntity(entities, {
          _: tag.entityName,
          offset: offset.offset,
          length: 0
        })).length += value.length;
      }
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
  offset: {offset: number} = {offset: 0},
  currentEntities: {[_ in MessageEntity['_']]?: MessageEntity} = {}
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
      if(selNode === node) {
        line.push(nodeValue.substr(0, selOffset) + SELECTION_SEPARATOR + nodeValue.substr(selOffset));
      } else {
        line.push(nodeValue);
      }
    } else if(selNode === node) {
      line.push(SELECTION_SEPARATOR);
    }

    if(entities && nodeValue.length && node.parentElement) {
      checkElementForEntity(node.parentElement, nodeValue, entities, offset, line, currentEntities);
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
  const isQuote = /* node.matches(markdownTags.quote.match) &&  */node.matches('.quote'); // * can have inner formatted quotes, check by class
  const isBlock = BLOCK_TAGS.has(node.tagName) || isQuote;
  if(isBlock && ((line.length && line[line.length - 1].slice(-1) !== '\n') || node.tagName === 'BR'/*  || (BLOCK_TAGS.has(node.tagName) && lines.length) */)) {
    pushLine();
  } else {
    const alt = node.dataset.stickerEmoji || (node as HTMLImageElement).alt;
    const stickerEmoji = node.dataset.stickerEmoji;

    if(alt && entities) {
      checkElementForEntity(node, alt, entities, offset, line, currentEntities);
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

  // * prefill currentEntities for current element
  if(node.getAttribute('contenteditable') === null) {
    checkElementForEntity(node, '', entities, offset, line, currentEntities);
  }

  let curChild = node.firstChild as HTMLElement;
  while(curChild) {
    getRichElementValue(
      curChild,
      lines,
      line,
      selNode,
      selOffset,
      entities,
      offset,
      curChild.nodeType === curChild.TEXT_NODE ? currentEntities : {...currentEntities}
    );
    curChild = curChild.nextSibling as HTMLElement;

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
