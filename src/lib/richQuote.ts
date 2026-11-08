/*
 * A quote of a rich message (`quote_rich`), as the official apps make and read it (Telegram for iOS'
 * RichReplyQuote, Android's RichQuote): one fragment for every text of the message it takes, in the order
 * they stand in it — the first one the end of its text, the last one the start of its own, each between
 * whole. Where it starts (`quote_offset`) is counted in what those texts read, one after another, a line
 * break between each two.
 */

import type {
  InputReplyTo,
  MessageEntity,
  MessageReplyHeader,
  PageBlock,
  PageCaption,
  PageListItem,
  PageListOrderedItem,
  RichText,
  TextWithEntities
} from '@layer';
import {getGraphemeOffsets, snapGraphemeOffsetDown, snapGraphemeOffsetUp} from '@lib/richTextProcessor/graphemes';
import {getRichTextFlatText, joinRichTexts} from '@lib/richMessage';
import clamp from '@helpers/number/clamp';

export const RICH_QUOTE_MAX_FRAGMENTS = 32;

/** what a quote keeps of its text's formatting, in a quote of a message's text as in one of a rich message */
export const QUOTE_ENTITY_TYPES = new Set<MessageEntity['_']>([
  'messageEntityBold',
  'messageEntityItalic',
  'messageEntityUnderline',
  'messageEntityStrike',
  'messageEntitySpoiler',
  'messageEntityCustomEmoji',
  'messageEntityEmoji',
  'messageEntityFormattedDate'
]);

/** a text of a rich message a quote can take */
export type RichQuoteNode = {
  text: RichText,
  // where it stands in the message, as what draws it says (`getRichQuoteNodeId`)
  id: string,
  // what it reads
  flat: string,
  // after what cannot be read (a block of no kind known): what the server counts there is not known
  afterUnknown?: boolean,
  // a code block or a formula: drawn as it reads, nothing of it formatted
  code?: boolean
};

/** a place in a text of a rich message: which one, how far in what it reads */
export type RichQuoteBoundary = {index: number, offset: number};

/**
 * Where a text stands in a rich message, as iOS' InstantPageTextNodeId has it: the path of its block (a block's index
 * among its own; what a quote, a details, a collage or a slideshow holds goes on from its path, a list item from its
 * list's), and what of the block it is: its `text`, its `caption` or `credit`, its `title`, a `cell:<row>,<column>`
 */
export const getRichQuoteNodeId = (path: number[], part: string) => path.join('.') + ':' + part;

// what is taken whole or not at all: math, a custom emoji, a date, a change of a text, a button (and a picture, which
// reads nothing)
const isAtom = (text: RichText) => text._ === 'textImage' ||
  text._ === 'textMath' ||
  text._ === 'textCustomEmoji' ||
  text._ === 'textDate' ||
  text._ === 'textDiff' ||
  text._ === 'textButton';

/** What becomes of a text of a rich message where it stands (`getRichQuoteNodeId`): none to leave it out */
export type RichQuoteTextMapper = (text: RichText, id: string, code?: boolean) => RichText | undefined;

const EMPTY_RICH_TEXT: RichText = {_: 'textEmpty'};
const paragraphBlock = (text: RichText): PageBlock => ({_: 'pageBlockParagraph', text});

/**
 * The blocks of a rich message with each of the texts a quote can take as `map` gives it back, called in the order
 * the texts stand in the message. A block left with no text is left out, as are a list's items and a table's rows
 * with none; a text the block it stands in cannot carry by itself (a picture's caption, a table's title alone) is a
 * paragraph. A code block or a formula is `code`: drawn as it reads, nothing of it formatted.
 */
export function mapRichQuoteTexts(blocks: PageBlock[], map: RichQuoteTextMapper, onUnknown?: () => void): PageBlock[] {
  const mapBlocks = (blocks: PageBlock[], prefix: number[]): PageBlock[] => (blocks || []).flatMap((block, index): PageBlock[] => {
    const path = [...prefix, index];
    const mapText = (text: RichText, part: string, code?: boolean, at = path) => (
      text ? map(text, getRichQuoteNodeId(at, part), code) : undefined
    );
    const mapCaption = (caption: PageCaption) => caption ?
      [mapText(caption.text, 'caption'), mapText(caption.credit, 'credit')].filter(Boolean).map(paragraphBlock) :
      [];

    switch(block._) {
      case 'pageBlockParagraph':
      case 'pageBlockHeading1':
      case 'pageBlockHeading2':
      case 'pageBlockHeading3':
      case 'pageBlockHeading4':
      case 'pageBlockHeading5':
      case 'pageBlockHeading6':
      case 'pageBlockFooter':
      case 'pageBlockThinking': {
        const text = mapText(block.text, 'text');
        return text ? [{...block, text}] : [];
      }
      case 'pageBlockPreformatted': {
        const text = mapText(block.text, 'text', true);
        return text ? [{...block, text}] : [];
      }
      case 'pageBlockMath':
        return mapText({_: 'textMath', source: block.source}, 'text', true) ? [block] : [];
      case 'pageBlockBlockquote':
      case 'pageBlockPullquote': {
        const text = mapText(block.text, 'text');
        const caption = mapText(block.caption, 'caption');
        return text || caption ? [{...block, text: text || EMPTY_RICH_TEXT, caption: caption || EMPTY_RICH_TEXT}] : [];
      }
      case 'pageBlockBlockquoteBlocks': {
        const inner = mapBlocks(block.blocks, path);
        const caption = mapText(block.caption, 'caption');
        return inner.length || caption ? [{...block, blocks: inner, caption: caption || EMPTY_RICH_TEXT}] : [];
      }
      case 'pageBlockList':
      case 'pageBlockOrderedList': {
        const items = (block.items as (PageListItem | PageListOrderedItem)[]).map((item, itemIndex) => {
          const at = [...path, itemIndex];
          if('text' in item) {
            const text = mapText(item.text, 'text', false, at);
            return text && {...item, text};
          }

          const inner = mapBlocks(item.blocks, at);
          return inner.length ? {...item, blocks: inner} : undefined;
        });
        const kept = items.filter(Boolean);
        if(!kept.length) return [];
        if(block._ === 'pageBlockList') return [{...block, items: kept as PageListItem[]}];
        if(kept.length === items.length) return [{...block, items: kept as PageListOrderedItem[]}];
        // * the items left keep their numbers
        const first = items.findIndex(Boolean);
        const start = block.start ?? (block.pFlags.reversed ? block.items.length : 1);
        return [{...block, items: kept as PageListOrderedItem[], start: block.pFlags.reversed ? start - first : start + first}];
      }
      case 'pageBlockTable': {
        const title = mapText(block.title, 'title');
        const rows = block.rows.map((row, rowIndex) => {
          const texts = row.cells.map((cell, cellIndex) => mapText(cell.text, `cell:${rowIndex},${cellIndex}`));
          return texts.some(Boolean) ?
            {...row, cells: row.cells.map((cell, cellIndex) => ({...cell, text: texts[cellIndex] || EMPTY_RICH_TEXT}))} :
            undefined;
        }).filter(Boolean);
        if(rows.length) return [{...block, title: title || EMPTY_RICH_TEXT, rows}];
        return title ? [paragraphBlock(title)] : [];
      }
      case 'pageBlockDetails': {
        const title = mapText(block.title, 'title');
        const inner = mapBlocks(block.blocks, path);
        return title || inner.length ? [{...block, title: title || EMPTY_RICH_TEXT, blocks: inner}] : [];
      }
      case 'pageBlockPhoto':
      case 'pageBlockVideo':
      case 'pageBlockAudio':
      case 'pageBlockMap':
        return mapCaption(block.caption);
      case 'pageBlockCollage':
      case 'pageBlockSlideshow':
        return [...mapBlocks(block.items, path), ...mapCaption(block.caption)];
      case 'pageBlockUnsupported':
        onUnknown?.();
        return [];
      default:
        return [];
    }
  });

  return mapBlocks(blocks, []);
}

/** The texts of a rich message a quote can take, in the order they stand in it: those that read something */
export function getRichQuoteNodes(blocks: PageBlock[]): RichQuoteNode[] {
  const nodes: RichQuoteNode[] = [];
  let unknown = false;
  mapRichQuoteTexts(blocks, (text, id, code) => {
    const flat = getRichTextFlatText(text);
    if(flat) {
      nodes.push({text, id, flat, ...(unknown && {afterUnknown: true}), ...(code && {code})});
      unknown = false;
    }

    return text;
  }, () => unknown = true);
  return nodes;
}

// what a formatting holds: its one text
const getWrapped = (text: RichText): RichText => {
  return !isAtom(text) && text._ !== 'textPlain' && text._ !== 'textConcat' && 'text' in text ? text.text : undefined;
};

/** The part of `text` that reads its flat range [from, to): what is wholly in it as it is, an atom it touches whole */
export function sliceRichText(text: RichText, from: number, to: number): RichText | undefined {
  let position = 0;
  const slice = (text: RichText): RichText | undefined => {
    const start = position;
    if(isAtom(text)) {
      position += getRichTextFlatText(text).length;
      const end = position;
      return (start === end ? from <= start && start < to : start < to && end > from) ? text : undefined;
    }

    let sliced: RichText;
    if(text._ === 'textPlain') {
      position += text.text.length;
      const [lower, upper] = [Math.max(from, start) - start, Math.min(to, position) - start];
      if(lower < upper) sliced = {_: 'textPlain', text: text.text.slice(lower, upper)};
    } else if(text._ === 'textConcat') {
      const texts = text.texts.map(slice).filter(Boolean);
      if(texts.length) sliced = {_: 'textConcat', texts};
    } else {
      const wrapped = getWrapped(text);
      const child = wrapped && slice(wrapped);
      if(child) sliced = {...text, text: child} as RichText;
    }

    const end = position;
    if(start === end || end <= from || start >= to) return;
    return from <= start && end <= to ? text : sliced;
  };

  return slice(text);
}

/**
 * `offset` moved off where no quote may start or end: out of an atom (to its start, or to its end `up`) and out of
 * a grapheme (a surrogate pair, an emoji of a skin tone, a flag)
 */
function snapRichTextOffset(text: RichText, offset: number, up: boolean) {
  let position = 0, result = offset;
  const walk = (text: RichText) => {
    const start = position;
    if(isAtom(text)) {
      position += getRichTextFlatText(text).length;
      if(start < offset && offset < position) result = up ? position : start;
    } else if(text._ === 'textPlain') {
      position += text.text.length;
      if(start < offset && offset < position) {
        const offsets = getGraphemeOffsets(text.text);
        result = start + (up ? snapGraphemeOffsetUp : snapGraphemeOffsetDown)(offsets, offset - start);
      }
    } else if(text._ === 'textConcat') {
      text.texts.forEach(walk);
    } else {
      const wrapped = getWrapped(text);
      if(wrapped) walk(wrapped);
    }
  };

  walk(text);
  return result;
}

/** What a quote, or a copy, may carry: a button as its label, no pictures */
export function normalizeRichQuoteFragment(text: RichText): RichText | undefined {
  switch(text._) {
    case 'textImage':
      return;
    case 'textButton': {
      const label = getRichTextFlatText(text.text);
      return label ? {_: 'textPlain', text: label} : undefined;
    }
    case 'textConcat': {
      const texts = text.texts.map(normalizeRichQuoteFragment).filter(Boolean);
      return texts.length ? {_: 'textConcat', texts} : undefined;
    }
    default: {
      const wrapped = getWrapped(text);
      if(!wrapped) return text;
      const child = normalizeRichQuoteFragment(wrapped);
      return child && {...text, text: child} as RichText;
    }
  }
}

const isBefore = (a: RichQuoteBoundary, b: RichQuoteBoundary) => a.index < b.index || (a.index === b.index && a.offset < b.offset);
const isTrimmable = (character: string) => character === ' ' || character === '\n';

/**
 * The quote of what runs from `start` to `end` across `nodes`, made as the server checks it (iOS'
 * makeRichReplyQuote): spaces and line breaks at either end left out, at most `RICH_QUOTE_MAX_FRAGMENTS` fragments
 * and `maxLength` of what they read together, the rest cut off where a quote may end. None if nothing is taken
 */
export function makeRichQuote(
  nodes: RichQuoteNode[],
  start: RichQuoteBoundary,
  end: RichQuoteBoundary,
  maxLength: number
): {fragments: RichText[], offset: number} | undefined {
  const clampBoundary = ({index, offset}: RichQuoteBoundary): RichQuoteBoundary => ({
    index,
    offset: clamp(offset, 0, nodes[index].flat.length)
  });
  if(!nodes[start.index] || !nodes[end.index]) return;
  let [lower, upper] = [clampBoundary(start), clampBoundary(end)];
  if(isBefore(upper, lower)) [lower, upper] = [upper, lower];

  while(isBefore(lower, upper)) {
    const flat = nodes[lower.index].flat;
    if(lower.offset >= flat.length) lower = {index: lower.index + 1, offset: 0};
    else if(isTrimmable(flat[lower.offset])) ++lower.offset;
    else break;
  }

  while(isBefore(lower, upper)) {
    const flat = nodes[upper.index].flat;
    if(upper.offset <= 0) upper = {index: upper.index - 1, offset: nodes[upper.index - 1].flat.length};
    else if(isTrimmable(flat[upper.offset - 1])) --upper.offset;
    else break;
  }

  lower.offset = snapRichTextOffset(nodes[lower.index].text, lower.offset, false);
  upper.offset = snapRichTextOffset(nodes[upper.index].text, upper.offset, true);
  if(!isBefore(lower, upper)) return;

  const fragments: RichText[] = [];
  let remaining = maxLength;
  for(let index = lower.index; index <= upper.index && fragments.length < RICH_QUOTE_MAX_FRAGMENTS; ++index) {
    const node = nodes[index];
    // what the server counts in what cannot be read here is not known: the quote ends before it
    if(index > lower.index && node.afterUnknown) break;
    if(fragments.length) --remaining;
    const from = index === lower.index ? lower.offset : 0;
    let to = index === upper.index ? upper.offset : node.flat.length;
    let isCut = false;
    if(to - from > remaining) {
      // a cut is a new end of the quote, left out of as the selection's own is
      to = snapRichTextOffset(node.text, from + Math.max(0, remaining), false);
      while(to > from && isTrimmable(node.flat[to - 1])) --to;
      to = snapRichTextOffset(node.text, to, false);
      isCut = true;
    }

    const sliced = to > from && sliceRichText(node.text, from, to);
    const fragment = sliced && normalizeRichQuoteFragment(sliced);
    if(fragment) {
      fragments.push(fragment);
      remaining -= getRichTextFlatText(fragment).length;
    } else if(!isCut) {
      // a text of the run gave nothing: what comes after would not follow it
      return;
    }

    if(isCut) break;
  }

  if(!fragments.length) return;

  let offset = lower.offset;
  for(let index = 0; index < lower.index; ++index) {
    offset += nodes[index].flat.length + 1;
  }

  return {fragments, offset};
}

/**
 * What a selection from `start` to `end` across the texts of `blocks` copies: the blocks those texts stand in, as
 * they stand (a heading a heading, a list's items its list, a quote with its author), the first and the last text
 * only as far as it is taken, every text between whole. What reads nothing (a picture, a divider) is left out.
 */
export function sliceRichQuoteBlocks(
  blocks: PageBlock[],
  nodes: RichQuoteNode[],
  start: RichQuoteBoundary,
  end: RichQuoteBoundary
): PageBlock[] {
  const taken: Map<string, {from: number, to: number}> = new Map();
  for(let index = start.index; index <= end.index; ++index) {
    taken.set(nodes[index].id, {
      from: index === start.index ? start.offset : 0,
      to: index === end.index ? end.offset : nodes[index].flat.length
    });
  }

  return mapRichQuoteTexts(blocks, (text, id) => {
    const range = taken.get(id);
    const sliced = range && range.to > range.from && sliceRichText(text, range.from, range.to);
    return sliced && normalizeRichQuoteFragment(sliced);
  });
}

/**
 * Where a selection that took `runs` (each a text of `nodes` and how far from and to in what it reads) begins and
 * ends: the first text's lowest offset, the last one's highest — what is drawn first is not always first in the
 * message (a table's cell that spans rows comes after the cells of its last row)
 */
export function getRichQuoteSelectionBoundaries(runs: {index: number, from: number, to: number}[]) {
  let start: RichQuoteBoundary, end: RichQuoteBoundary;
  for(const {index, from, to} of runs) {
    if(!start || isBefore({index, offset: from}, start)) start = {index, offset: from};
    if(!end || isBefore(end, {index, offset: to})) end = {index, offset: to};
  }

  return start && {start, end};
}

/** A rich quote as text: its fragments one under another, with what a quote keeps of their formatting */
export function getRichQuoteTextWithEntities(fragments: RichText[]): TextWithEntities {
  const joined = joinRichTexts(fragments, '\n');
  return {...joined, entities: joined.entities.filter((entity) => QUOTE_ENTITY_TYPES.has(entity._))};
}

/** The quote a reply carries, as text (a rich one's fragments joined), and the fragments of a rich one */
export function getReplyQuote(replyTo: MessageReplyHeader.messageReplyHeader | InputReplyTo.inputReplyToMessage) {
  if(replyTo.quote_rich?.length) {
    const {text, entities} = getRichQuoteTextWithEntities(replyTo.quote_rich);
    return {text, entities, offset: replyTo.quote_offset, rich: replyTo.quote_rich};
  }

  if(replyTo.quote_text) {
    return {text: replyTo.quote_text, entities: replyTo.quote_entities, offset: replyTo.quote_offset};
  }
}
