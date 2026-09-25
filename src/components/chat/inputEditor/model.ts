import type {Editor, JSONContent} from '@tiptap/core';
import {TextSelection, type Transaction} from '@tiptap/pm/state';
import type {MessageEntity} from '@layer';
import combineSameEntities from '@lib/richTextProcessor/combineSameEntities';
import sortEntities from '@lib/richTextProcessor/sortEntities';
import {
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import {orderedListItemValues} from '@components/chat/inputEditor/orderedList';
import {formatOrderedListMarker} from '@lib/richTextProcessor/orderedList';
import {getEffectiveCodeBlockLanguage} from '@components/chat/inputEditor/codeLanguage';

type ProseMirrorNode = Editor['state']['doc'];
type ProseMirrorMark = ProseMirrorNode['marks'][number];

type TextLine = {
  end: number,
  start: number
};

type ListLine = TextLine & {
  checked: boolean,
  checkbox: boolean,
  contentStart: number,
  depth: number,
  number?: number,
  type: 'bulletList' | 'orderedList' | 'taskList'
};

type TextPositionSegment = {
  pmEnd: number,
  pmStart: number,
  textEnd: number,
  textStart: number,
  type: 'atom' | 'linear' | 'separator'
};

type TextPositionPoint = {
  pm: number,
  text: number
};

export function isTrailingPlaceholderNode(node?: ProseMirrorNode) {
  return !!node && node.type.name === 'paragraph' && node.content.size === 0;
}

/**
 * Pull a range selection back out of the technical trailing paragraph.
 *
 * Select-all reaches it, and a block operation run over that selection — wrapping
 * in a quote, turning it into a list — would swallow the placeholder and leave a
 * trailing newline in what gets sent.
 */
export function clampSelectionOutsideTrailingPlaceholder(tr: Transaction) {
  const original = tr.selection;
  const trailing = tr.doc.lastChild;
  if(original.empty || tr.doc.childCount < 2 || !isTrailingPlaceholderNode(trailing)) return false;

  const end = tr.doc.content.size - trailing.nodeSize;
  if(original.from >= end || original.to <= end) return false;

  const from = TextSelection.findFrom(tr.doc.resolve(original.from), 1, true)?.$from;
  const to = TextSelection.findFrom(tr.doc.resolve(end), -1, true)?.$to;
  if(!from || !to) return false;

  tr.setSelection(original.anchor <= original.head ?
    TextSelection.create(tr.doc, from.pos, to.pos) :
    TextSelection.create(tr.doc, to.pos, from.pos));
  return true;
}

export function withoutTrailingPlaceholder(doc: ProseMirrorNode) {
  const trailing = doc.lastChild;
  if(!isTrailingPlaceholderNode(trailing)) return doc;
  if(doc.childCount === 1) {
    const paragraph = trailing.type.createAndFill();
    return paragraph ? doc.type.create(doc.attrs, paragraph) : doc;
  }
  return doc.copy(doc.content.cut(0, doc.content.size - trailing.nodeSize));
}

const INLINE_MARK_ORDER = [
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'highlight',
  'spoiler',
  'link',
  'mentionName',
  'code',
  'formattedDate'
];

function entityEnd(entity: MessageEntity) {
  return entity.offset + entity.length;
}

function isStructuralBlockquote(text: string, entity: MessageEntity.messageEntityBlockquote) {
  const end = entityEnd(entity);
  return (entity.offset === 0 || text[entity.offset - 1] === '\n') &&
    (end === text.length || text[end] === '\n');
}

function isBlockEntity(entity: MessageEntity, blockEntities: Set<MessageEntity>) {
  return blockEntities.has(entity);
}

function normalizeEntities(text: string, entities: MessageEntity[] = []) {
  return entities.filter((entity) => (
    entity.length > 0 &&
    entity.offset >= 0 &&
    entity.offset < text.length &&
    entityEnd(entity) <= text.length
  ));
}

function entityToMark(entity: MessageEntity): JSONContent['marks'][number] | undefined {
  switch(entity._) {
    case 'messageEntityBold':
      return {type: 'bold'};
    case 'messageEntityItalic':
      return {type: 'italic'};
    case 'messageEntityUnderline':
      return {type: 'underline'};
    case 'messageEntityStrike':
      return {type: 'strike'};
    case 'messageEntitySubscript':
      return {type: 'subscript'};
    case 'messageEntitySuperscript':
      return {type: 'superscript'};
    case 'messageEntityHighlight':
      return {type: 'highlight'};
    case 'messageEntitySpoiler':
      return {type: 'spoiler'};
    case 'messageEntityCode':
      return {type: 'code'};
    case 'messageEntityTextUrl':
      return {type: 'link', attrs: {href: entity.url}};
    case 'messageEntityMentionName':
      return {type: 'mentionName', attrs: {userId: entity.user_id}};
    case 'messageEntityBlockquote':
      return {
        type: 'inlineQuote',
        attrs: {collapsed: !!entity.pFlags?.collapsed}
      };
    case 'messageEntityFormattedDate':
      return {
        type: 'formattedDate',
        attrs: {
          date: entity.date,
          pFlags: {...entity.pFlags}
        }
      };
  }
}

function activeMarks(
  entities: MessageEntity[],
  start: number,
  end: number,
  blockEntities: Set<MessageEntity>
) {
  let marks = entities
  .filter((entity) => !isBlockEntity(entity, blockEntities) && entity._ !== 'messageEntityCustomEmoji')
  .filter((entity) => entity.offset <= start && entityEnd(entity) >= end)
  .map(entityToMark)
  .filter((mark): mark is NonNullable<typeof mark> => !!mark);

  const single = marks.find((mark) => mark.type === 'code' || mark.type === 'formattedDate');
  if(single) {
    marks = marks.filter((mark) => mark === single || mark.type === 'inlineQuote');
  }

  marks.sort((a, b) => INLINE_MARK_ORDER.indexOf(a.type) - INLINE_MARK_ORDER.indexOf(b.type));
  return marks;
}

function inlineContent(
  text: string,
  entities: MessageEntity[],
  start: number,
  end: number,
  blockEntities: Set<MessageEntity>
) {
  const content: JSONContent[] = [];
  const relevant = entities.filter((entity) => (
    !isBlockEntity(entity, blockEntities) &&
    entity.offset < end &&
    entityEnd(entity) > start
  ));
  const boundaries = new Set([start, end]);
  relevant.forEach((entity) => {
    boundaries.add(Math.max(start, entity.offset));
    boundaries.add(Math.min(end, entityEnd(entity)));
  });
  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
  const customEmojiByOffset = new Map<number, MessageEntity.messageEntityCustomEmoji>();
  relevant.forEach((entity) => {
    if(entity._ === 'messageEntityCustomEmoji') {
      customEmojiByOffset.set(entity.offset, entity);
    }
  });

  let offset = start;
  while(offset < end) {
    const customEmoji = customEmojiByOffset.get(offset);
    if(customEmoji && entityEnd(customEmoji) <= end) {
      const emojiEnd = entityEnd(customEmoji);
      const emoji = text.slice(offset, emojiEnd);
      content.push({
        type: 'customEmoji',
        attrs: {
          documentId: customEmoji.document_id,
          emoji
        },
        marks: activeMarks(relevant, offset, emojiEnd, blockEntities)
      });
      offset = emojiEnd;
      continue;
    }

    const next = sortedBoundaries.find((boundary) => boundary > offset) ?? end;
    const value = text.slice(offset, next);
    if(value) {
      content.push({
        type: 'text',
        text: value,
        marks: activeMarks(relevant, offset, next, blockEntities)
      });
    }
    offset = next;
  }

  return content.length ? content : undefined;
}

function splitLines(text: string) {
  const lines: TextLine[] = [];
  let start = 0;
  do {
    const linebreak = text.indexOf('\n', start);
    const end = linebreak === -1 ? text.length : linebreak;
    lines.push({start, end});
    if(linebreak === -1) break;
    start = linebreak + 1;
  } while(start <= text.length);
  return lines;
}

function paragraph(
  text: string,
  entities: MessageEntity[],
  line: TextLine,
  blockEntities: Set<MessageEntity>
): JSONContent {
  return {
    type: 'paragraph',
    content: inlineContent(text, entities, line.start, line.end, blockEntities)
  };
}

function parseListLine(text: string, line: TextLine): ListLine | undefined {
  const value = text.slice(line.start, line.end);
  const match = /^( *)(?:(- )|(\d+)\. )(?:\[([ xX])\](?: |$))?/.exec(value);
  if(!match || match[1].length % 2) return;

  const checkbox = match[4] !== undefined;
  const type = match[2] ? checkbox ? 'taskList' : 'bulletList' : 'orderedList';
  return {
    ...line,
    checked: checkbox && match[4].toLowerCase() === 'x',
    checkbox,
    contentStart: line.start + match[0].length,
    depth: match[1].length / 2,
    number: type === 'orderedList' ? Number(match[3]) : undefined,
    type
  };
}

function hasBlockedStart(line: TextLine, blockedStarts: Set<number>) {
  for(const start of blockedStarts) {
    if(start >= line.start && start <= line.end) return true;
  }
  return false;
}

function parseList(
  text: string,
  entities: MessageEntity[],
  lines: TextLine[],
  startIndex: number,
  endIndex: number,
  depth: number,
  blockEntities: Set<MessageEntity>,
  blockedStarts: Set<number>
): {nextIndex: number, node: JSONContent} {
  const first = parseListLine(text, lines[startIndex]);
  const listType = first.type;
  const start = first.number || 1;
  const items: JSONContent[] = [];
  let index = startIndex;

  while(index < endIndex) {
    const itemLine = parseListLine(text, lines[index]);
    if(
      !itemLine ||
      hasBlockedStart(itemLine, blockedStarts) ||
      itemLine.depth !== depth ||
      itemLine.type !== listType ||
      (listType === 'orderedList' && itemLine.number !== start + items.length)
    ) {
      break;
    }

    const item: JSONContent = {
      type: listType === 'taskList' ? 'taskItem' : 'listItem',
      attrs: listType === 'taskList' ? {checked: itemLine.checked} :
        itemLine.checkbox ? {checkbox: true, checked: itemLine.checked} : undefined,
      content: [paragraph(text, entities, {
        start: itemLine.contentStart,
        end: itemLine.end
      }, blockEntities)]
    };
    ++index;

    while(index < endIndex) {
      const nestedLine = parseListLine(text, lines[index]);
      if(
        !nestedLine ||
        hasBlockedStart(nestedLine, blockedStarts) ||
        nestedLine.depth <= depth
      ) {
        break;
      }
      if(nestedLine.depth !== depth + 1) break;

      const nested = parseList(
        text,
        entities,
        lines,
        index,
        endIndex,
        depth + 1,
        blockEntities,
        blockedStarts
      );
      item.content.push(nested.node);
      index = nested.nextIndex;
    }

    items.push(item);
  }

  return {
    nextIndex: index,
    node: {
      type: listType,
      attrs: listType === 'orderedList' ? {start} : undefined,
      content: items
    }
  };
}

function parseParagraphsAndLists(
  text: string,
  entities: MessageEntity[],
  lines: TextLine[],
  startIndex: number,
  endIndex: number,
  blockEntities: Set<MessageEntity>,
  blockedStarts: Set<number>,
  preformatted: MessageEntity.messageEntityPre[]
) {
  const content: JSONContent[] = [];
  let index = startIndex;
  while(index < endIndex) {
    const pre = parsePreformattedLine(text, entities, lines, index, preformatted, blockEntities);
    if(pre) {
      content.push(...pre.content);
      index = pre.nextIndex + 1;
      continue;
    }

    const listLine = parseListLine(text, lines[index]);
    if(listLine?.depth === 0 && !hasBlockedStart(listLine, blockedStarts)) {
      const list = parseList(text, entities, lines, index, endIndex, 0, blockEntities, blockedStarts);
      content.push(list.node);
      index = list.nextIndex;
      continue;
    }

    content.push(paragraph(text, entities, lines[index], blockEntities));
    ++index;
  }
  return content;
}

function parsePreformattedLine(
  text: string,
  entities: MessageEntity[],
  lines: TextLine[],
  startIndex: number,
  preformatted: MessageEntity.messageEntityPre[],
  blockEntities: Set<MessageEntity>
) {
  const content: JSONContent[] = [];
  let index = startIndex;
  let cursor = lines[index].start;
  let pre = preformatted.find((entity) => (
    entity.offset >= cursor && entity.offset <= lines[index].end
  ));
  if(!pre) return;

  while(pre) {
    const startLine = lines[index];
    if(pre.offset > cursor) {
      content.push(paragraph(text, entities, {start: cursor, end: pre.offset}, blockEntities));
    }

    const end = entityEnd(pre);
    while(index + 1 < lines.length && lines[index + 1].start <= end) ++index;
    const endLine = lines[index];
    content.push({
      type: 'codeBlock',
      attrs: {
        joinAfter: end > endLine.start && end < endLine.end,
        joinBefore: pre.offset > startLine.start,
        language: pre.language || ''
      },
      content: [{type: 'text', text: text.slice(pre.offset, end)}]
    });
    cursor = end;

    pre = preformatted.find((entity) => (
      entity.offset >= cursor && entity.offset <= endLine.end
    ));
  }

  const endLine = lines[index];
  if(cursor < endLine.end) {
    content.push(paragraph(text, entities, {start: cursor, end: endLine.end}, blockEntities));
  }

  return {content, nextIndex: index};
}

function withoutInlineQuoteMark(node: JSONContent): JSONContent {
  const marks = node.marks?.filter((mark) => mark.type !== 'inlineQuote');
  return {
    ...node,
    marks: marks?.length ? marks : undefined
  };
}

function trimHorizontalWhitespace(
  content: JSONContent[],
  direction: 'end' | 'start'
): JSONContent[] {
  const result = content.map((child) => ({...child}));
  const indexes = direction === 'start' ?
    result.map((_child, index) => index) :
    result.map((_child, index) => index).reverse();
  for(const index of indexes) {
    const child = result[index];
    if(child.type !== 'text') break;
    const text = child.text || '';
    const trimmed = direction === 'start' ?
      text.replace(/^[\t ]+/, '') :
      text.replace(/[\t ]+$/, '');
    if(trimmed) {
      child.text = trimmed;
      break;
    }
    result.splice(index, 1);
  }
  return result;
}

function splitInlineQuotes(node: JSONContent): JSONContent[] {
  if(node.type !== 'paragraph' || !node.content?.some((child) => (
    child.marks?.some((mark) => mark.type === 'inlineQuote')
  ))) {
    return [{
      ...node,
      content: node.content?.flatMap(splitInlineQuotes)
    }];
  }

  const groups: Array<{
    collapsed: boolean,
    content: JSONContent[],
    quoted: boolean
  }> = [];
  node.content.forEach((child) => {
    const quote = child.marks?.find((mark) => mark.type === 'inlineQuote');
    const collapsed = !!quote?.attrs?.collapsed;
    const quoted = !!quote;
    const previous = groups[groups.length - 1];
    if(!previous || previous.quoted !== quoted || previous.collapsed !== collapsed) {
      groups.push({collapsed, content: [], quoted});
    }
    groups[groups.length - 1].content.push(withoutInlineQuoteMark(child));
  });

  return groups.map((group, index) => {
    let content = group.content;
    if(index) content = trimHorizontalWhitespace(content, 'start');
    if(index < groups.length - 1) content = trimHorizontalWhitespace(content, 'end');
    const paragraph: JSONContent = {
      ...node,
      content: content.length ? content : undefined
    };
    if(!group.quoted) return paragraph;
    return {
      type: 'blockquote',
      attrs: {collapsed: group.collapsed},
      content: [paragraph]
    };
  }).filter((child) => child.type === 'blockquote' || !!child.content?.length);
}

export function normalizeBlockOnlyQuotes(document: JSONContent): JSONContent {
  return {
    ...document,
    content: document.content?.flatMap(splitInlineQuotes)
  };
}

/** Inline surfaces keep list-looking text literal and use hard breaks between lines. */
export function telegramTextToTiptapInlineContent(text: string, sourceEntities: MessageEntity[] = []) {
  const entities = normalizeEntities(text, sourceEntities)
  .filter((entity) => entity._ !== 'messageEntityBlockquote')
  .map((entity): MessageEntity => entity._ === 'messageEntityPre' ?
    {_: 'messageEntityCode', offset: entity.offset, length: entity.length} : entity);
  const blockEntities = new Set<MessageEntity>();
  return splitLines(text).flatMap((line, index): JSONContent[] => [
    ...(index ? [{type: 'hardBreak'}] : []),
    ...(inlineContent(text, entities, line.start, line.end, blockEntities) || [])
  ]);
}

export function telegramTextToTiptap(text: string, sourceEntities: MessageEntity[] = []): JSONContent {
  const entities = normalizeEntities(text, sourceEntities);
  const lines = splitLines(text);
  const blockquotes = entities.filter((entity): entity is MessageEntity.messageEntityBlockquote => (
    entity._ === 'messageEntityBlockquote' && isStructuralBlockquote(text, entity)
  ));
  const preformatted = entities.filter((entity): entity is MessageEntity.messageEntityPre => (
    entity._ === 'messageEntityPre'
  )).sort((a, b) => a.offset - b.offset);
  const blockEntities = new Set<MessageEntity>([...blockquotes, ...preformatted]);
  const blockedStarts = new Set([...blockquotes, ...preformatted].map((entity) => entity.offset));
  const content: JSONContent[] = [];

  for(let index = 0; index < lines.length; ++index) {
    const line = lines[index];
    const quote = blockquotes.find((entity) => entity.offset === line.start);
    if(quote) {
      const end = entityEnd(quote);
      let nextIndex = index + 1;
      while(nextIndex < lines.length && lines[nextIndex].start < end) ++nextIndex;
      const quoteBlockedStarts = new Set(blockedStarts);
      quoteBlockedStarts.delete(quote.offset);
      const quoteContent = parseParagraphsAndLists(
        text,
        entities,
        lines,
        index,
        nextIndex,
        blockEntities,
        quoteBlockedStarts,
        preformatted
      );
      index = nextIndex - 1;
      content.push({
        type: 'blockquote',
        attrs: {collapsed: !!quote.pFlags?.collapsed},
        content: quoteContent
      });
      continue;
    }

    const pre = parsePreformattedLine(text, entities, lines, index, preformatted, blockEntities);
    if(pre) {
      content.push(...pre.content);
      index = pre.nextIndex;
      continue;
    }

    const listLine = parseListLine(text, line);
    if(listLine?.depth === 0) {
      const list = parseList(
        text,
        entities,
        lines,
        index,
        lines.length,
        0,
        blockEntities,
        blockedStarts
      );
      content.push(list.node);
      index = list.nextIndex - 1;
      continue;
    }

    content.push(paragraph(text, entities, line, blockEntities));
  }

  return normalizeBlockOnlyQuotes({
    type: 'doc',
    content: content.length ? content : [{type: 'paragraph'}]
  });
}

function markToEntity(mark: ProseMirrorMark, offset: number, length: number): MessageEntity | undefined {
  switch(mark.type.name) {
    case 'bold':
      return {_: 'messageEntityBold', offset, length};
    case 'italic':
      return {_: 'messageEntityItalic', offset, length};
    case 'underline':
      return {_: 'messageEntityUnderline', offset, length};
    case 'strike':
      return {_: 'messageEntityStrike', offset, length};
    case 'subscript':
      return {_: 'messageEntitySubscript', offset, length};
    case 'superscript':
      return {_: 'messageEntitySuperscript', offset, length};
    case 'highlight':
      return {_: 'messageEntityHighlight', offset, length};
    case 'spoiler':
      return {_: 'messageEntitySpoiler', offset, length};
    case 'code':
      return {_: 'messageEntityCode', offset, length};
    case 'link':
      return {_: 'messageEntityTextUrl', offset, length, url: mark.attrs.href};
    case 'mentionName':
      return {_: 'messageEntityMentionName', offset, length, user_id: mark.attrs.userId};
    case 'formattedDate':
      return {
        _: 'messageEntityFormattedDate',
        offset,
        length,
        date: mark.attrs.date,
        pFlags: {...mark.attrs.pFlags}
      };
  }
}

function markKey(mark: ProseMirrorMark) {
  return `${mark.type.name}:${JSON.stringify(mark.attrs)}`;
}

function firstTextPosition(node: ProseMirrorNode, position: number): number {
  if(node.isTextblock || !node.childCount) return position + 1;
  return firstTextPosition(node.firstChild, position + 1);
}

function lastTextPosition(node: ProseMirrorNode, position: number): number {
  if(node.isTextblock || !node.childCount) return position + node.nodeSize - 1;
  let lastOffset = 0;
  node.forEach((_child, offset) => lastOffset = offset);
  return lastTextPosition(node.lastChild, position + 1 + lastOffset);
}

export type SerializedChatInputDocument = {
  entities: MessageEntity[],
  positionAtTextOffset: (offset: number, affinity?: 'backward' | 'forward') => number,
  text: string,
  textOffsetAtPosition: (position: number, affinity?: 'backward' | 'forward') => number
};

export function tiptapToTelegram(
  doc: ProseMirrorNode,
  stripTrailingPlaceholder = false,
  {forClipboard = false}: {forClipboard?: boolean} = {}
): SerializedChatInputDocument {
  const contentDocument = stripTrailingPlaceholder ?
    withoutTrailingPlaceholder(doc) :
    doc;
  let text = '';
  const entities: MessageEntity[] = [];
  const points: TextPositionPoint[] = [];
  const segments: TextPositionSegment[] = [];
  const lastEntityByMark = new Map<string, MessageEntity>();

  const addPoint = (pm: number) => points.push({pm, text: text.length});
  const addMarks = (marks: readonly ProseMirrorMark[], offset: number, length: number) => {
    marks.forEach((mark) => {
      const entity = markToEntity(mark, offset, length);
      if(!entity) return;

      const key = markKey(mark);
      const previous = lastEntityByMark.get(key);
      if(previous && entityEnd(previous) === offset) {
        previous.length += length;
      } else {
        entities.push(entity);
        lastEntityByMark.set(key, entity);
      }
    });
  };
  const append = (
    value: string,
    pmStart: number,
    pmEnd: number,
    type: TextPositionSegment['type'],
    marks: readonly ProseMirrorMark[] = []
  ) => {
    const textStart = text.length;
    text += value;
    const textEnd = text.length;
    segments.push({pmEnd, pmStart, textEnd, textStart, type});
    addMarks(marks, textStart, value.length);
  };

  const serializeInline = (node: ProseMirrorNode, contentStart: number) => {
    node.forEach((child, offset) => {
      const position = contentStart + offset;
      if(child.isText) {
        append(child.text || '', position, position + child.nodeSize, 'linear', child.marks);
      } else if(child.type.name === 'hardBreak') {
        append('\n', position, position + child.nodeSize, 'atom', child.marks);
      } else if(child.type.name === 'customEmoji') {
        const emoji = child.attrs.emoji || '';
        const textStart = text.length;
        append(emoji, position, position + child.nodeSize, 'atom', child.marks);
        entities.push({
          _: 'messageEntityCustomEmoji',
          document_id: child.attrs.documentId,
          offset: textStart,
          length: emoji.length
        });
      } else if(child.type.name === 'inlineMath') {
        append(`${child.attrs.source || ''}`, position, position + child.nodeSize, 'atom', child.marks);
      } else if(child.textContent) {
        append(child.textContent, position, position + child.nodeSize, 'atom', child.marks);
      }
    });
  };

  const serializeList = (node: ProseMirrorNode, position: number, depth: number) => {
    const items: Array<{node: ProseMirrorNode, position: number}> = [];
    node.forEach((child, offset) => items.push({node: child, position: position + 1 + offset}));

    const values = node.type.name === 'orderedList' ? [...orderedListItemValues(node)] : [];
    items.forEach((item, index) => {
      const listMarker = node.type.name === 'orderedList' ? `${formatOrderedListMarker(
        values[index], item.node.attrs.type || node.attrs.type
      )}. ` : '- ';
      const checkbox = node.type.name === 'taskList' || item.node.attrs.checkbox;
      const marker = checkbox ?
        `${listMarker}[${item.node.attrs.checked ? 'x' : ' '}] ` :
        listMarker;
      const firstPosition = firstTextPosition(item.node, item.position);
      append(`${'  '.repeat(depth)}${marker}`, firstPosition, firstPosition, 'separator');
      serializeContainer(item.node, item.position + 1, depth + 1);

      const next = items[index + 1];
      if(next) {
        append(
          '\n',
          lastTextPosition(item.node, item.position),
          firstTextPosition(next.node, next.position),
          'separator'
        );
      }
    });
  };

  const serializeTable = (node: ProseMirrorNode, position: number, listDepth: number) => {
    const rows: Array<{node: ProseMirrorNode, position: number}> = [];
    node.forEach((child, offset) => rows.push({node: child, position: position + 1 + offset}));

    rows.forEach((row, rowIndex) => {
      const cells: Array<{node: ProseMirrorNode, position: number}> = [];
      row.node.forEach((child, offset) => cells.push({
        node: child,
        position: row.position + 1 + offset
      }));

      cells.forEach((cell, cellIndex) => {
        serializeContainer(cell.node, cell.position + 1, listDepth);
        const nextCell = cells[cellIndex + 1];
        if(nextCell) {
          append(
          forClipboard ? '\t' : ' ',
          lastTextPosition(cell.node, cell.position),
            firstTextPosition(nextCell.node, nextCell.position),
            'separator'
          );
        }
      });

      const nextRow = rows[rowIndex + 1];
      if(nextRow) {
        append(
          '\n',
          lastTextPosition(row.node, row.position),
          firstTextPosition(nextRow.node, nextRow.position),
          'separator'
        );
      }
    });
  };

  const serializeBlock = (node: ProseMirrorNode, position: number, listDepth: number) => {
    if(node.type.name === 'blockMath') {
      append(`${node.attrs.source || ''}`, position, position + node.nodeSize, 'atom');
      return;
    }

    if(node.type.name === 'paragraph') {
      serializeInline(node, position + 1);
      return;
    }

    if(node.type.name === 'bulletList' || node.type.name === 'orderedList' || node.type.name === 'taskList') {
      serializeList(node, position, listDepth);
      return;
    }

    if(node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME) {
      node.forEach((child, offset) => {
        const childPosition = position + 1 + offset;
        if(child.type.name === CHAT_TABLE_TITLE_NODE_NAME) {
          addPoint(childPosition + 1);
          if(forClipboard) serializeInline(child, childPosition + 1);
          addPoint(childPosition + child.nodeSize - 1);
          if(forClipboard && child.content.size && node.lastChild?.type.name === 'table') {
            append(
              '\n',
              childPosition + child.nodeSize - 1,
              firstTextPosition(node.lastChild, position + node.nodeSize - node.lastChild.nodeSize - 1),
              'separator'
            );
          }
        } else if(child.type.name === 'table') {
          serializeTable(child, childPosition, listDepth);
        }
      });
      return;
    }

    if(node.type.name === 'table') {
      serializeTable(node, position, listDepth);
      return;
    }

    if(node.type.name === 'codeBlock') {
      const offset = text.length;
      serializeInline(node, position + 1);
      if(text.length > offset) {
        entities.push({
          _: 'messageEntityPre',
          offset,
          length: text.length - offset,
          language: getEffectiveCodeBlockLanguage(node.attrs, node.textContent)
        });
      }
      return;
    }

    if(node.type.name === 'blockquote') {
      const offset = text.length;
      serializeContainer(node, position + 1, listDepth);
      if(text.length > offset) {
        entities.push({
          _: 'messageEntityBlockquote',
          offset,
          length: text.length - offset,
          pFlags: {collapsed: node.attrs.collapsed || undefined}
        });
      }
      return;
    }

    if(node.isTextblock) {
      serializeInline(node, position + 1);
    } else {
      serializeContainer(node, position + 1, listDepth);
    }
  };

  const serializeContainer = (node: ProseMirrorNode, contentStart: number, listDepth: number) => {
    const children: Array<{node: ProseMirrorNode, position: number}> = [];
    node.forEach((child, offset) => {
      if(child.type.name === 'blockquoteCaption' && (!forClipboard || !child.content.size)) return;
      children.push({node: child, position: contentStart + offset});
    });
    children.forEach((child, index) => {
      const textStart = text.length;
      addPoint(firstTextPosition(child.node, child.position));
      serializeBlock(child.node, child.position, listDepth);
      addPoint(lastTextPosition(child.node, child.position));
      const next = children[index + 1];
      const hasTrailingPreNewline = child.node.type.name === 'codeBlock' &&
        text.length > textStart &&
        text.endsWith('\n');
      const joinsNext = child.node.type.name === 'codeBlock' && child.node.attrs.joinAfter;
      const joinsPrevious = next?.node.type.name === 'codeBlock' && next.node.attrs.joinBefore;
      if(next && !hasTrailingPreNewline && !joinsNext && !joinsPrevious) {
        append(
          '\n',
          lastTextPosition(child.node, child.position),
          firstTextPosition(next.node, next.position),
          'separator'
        );
      }
    });
  };

  serializeContainer(contentDocument, 0, 0);
  combineSameEntities(entities);
  sortEntities(entities);

  const positionAtTextOffset = (rawOffset: number, affinity: 'backward' | 'forward' = 'forward') => {
    const offset = Math.max(0, Math.min(text.length, rawOffset));
    const candidates = segments.filter((segment) => offset >= segment.textStart && offset <= segment.textEnd);
    const segment = affinity === 'forward' ? candidates[candidates.length - 1] : candidates[0];
    if(segment) {
      if(segment.type === 'linear' && (segment.pmEnd - segment.pmStart) === (segment.textEnd - segment.textStart)) {
        return segment.pmStart + offset - segment.textStart;
      }
      if(offset <= segment.textStart) return segment.pmStart;
      if(offset >= segment.textEnd) return segment.pmEnd;
      return affinity === 'forward' ? segment.pmEnd : segment.pmStart;
    }

    const exact = points.filter((point) => point.text === offset);
    if(exact.length) return affinity === 'forward' ? exact[exact.length - 1].pm : exact[0].pm;
    const nearest = points.reduce((best, point) => (
      !best || Math.abs(point.text - offset) < Math.abs(best.text - offset) ? point : best
    ), undefined as TextPositionPoint | undefined);
    return nearest?.pm ?? 1;
  };

  const textOffsetAtPosition = (
    rawPosition: number,
    affinity: 'backward' | 'forward' = 'forward'
  ) => {
    const position = Math.max(0, Math.min(doc.content.size, rawPosition));
    const candidates = segments.filter((segment) => position >= segment.pmStart && position <= segment.pmEnd);
    const segment = affinity === 'backward' ?
      candidates[0] :
      candidates.find((candidate) => candidate.type === 'linear') || candidates[candidates.length - 1];
    if(segment) {
      if(segment.type === 'linear' && (segment.pmEnd - segment.pmStart) === (segment.textEnd - segment.textStart)) {
        return segment.textStart + position - segment.pmStart;
      }
      if(position <= segment.pmStart) return segment.textStart;
      if(position >= segment.pmEnd) return segment.textEnd;
      return segment.textEnd;
    }

    const exact = points.find((point) => point.pm === position);
    if(exact) return exact.text;
    const nearest = points.reduce((best, point) => (
      !best || Math.abs(point.pm - position) < Math.abs(best.pm - position) ? point : best
    ), undefined as TextPositionPoint | undefined);
    return nearest?.text ?? 0;
  };

  return {text, entities, positionAtTextOffset, textOffsetAtPosition};
}
