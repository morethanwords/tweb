/*
 * A quote of a rich message (`quote_rich`), as the official apps make and read it (Telegram for iOS'
 * RichReplyQuote, Android's RichQuote): one fragment for every text of the message it takes, in the order
 * they stand in it — the first one the end of its text, the last one the start of its own, each between
 * whole. Where it starts (`quote_offset`) is counted in what those texts read, one after another, a line
 * break between each two.
 */

import type {InputReplyTo, MessageEntity, MessageReplyHeader, PageBlock, PageCaption, RichText, TextWithEntities} from '@layer';
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

/** The texts of a rich message a quote can take, in the order they stand in it: those that read something */
export function getRichQuoteNodes(blocks: PageBlock[]): RichQuoteNode[] {
  const nodes: RichQuoteNode[] = [];
  let unknown = false;
  const add = (text: RichText, path: number[], part: string, code?: boolean) => {
    const flat = getRichTextFlatText(text);
    if(flat) {
      nodes.push({text, id: getRichQuoteNodeId(path, part), flat, ...(unknown && {afterUnknown: true}), ...(code && {code})});
      unknown = false;
    }
  };
  const addCaption = (caption: PageCaption, path: number[]) => {
    if(!caption) return;
    add(caption.text, path, 'caption');
    add(caption.credit, path, 'credit');
  };
  const collect = (blocks: PageBlock[], prefix: number[]) => blocks?.forEach((block, index) => {
    const path = [...prefix, index];
    switch(block._) {
      case 'pageBlockParagraph':
      case 'pageBlockHeading1':
      case 'pageBlockHeading2':
      case 'pageBlockHeading3':
      case 'pageBlockHeading4':
      case 'pageBlockHeading5':
      case 'pageBlockHeading6':
      case 'pageBlockFooter':
      case 'pageBlockThinking':
        add(block.text, path, 'text');
        break;
      case 'pageBlockPreformatted':
        add(block.text, path, 'text', true);
        break;
      case 'pageBlockMath':
        add({_: 'textMath', source: block.source}, path, 'text', true);
        break;
      case 'pageBlockBlockquote':
      case 'pageBlockPullquote':
        add(block.text, path, 'text');
        add(block.caption, path, 'caption');
        break;
      case 'pageBlockBlockquoteBlocks':
        collect(block.blocks, path);
        add(block.caption, path, 'caption');
        break;
      case 'pageBlockList':
      case 'pageBlockOrderedList':
        block.items.forEach((item, itemIndex) => {
          if('text' in item) add(item.text, [...path, itemIndex], 'text');
          else collect(item.blocks, [...path, itemIndex]);
        });
        break;
      case 'pageBlockTable':
        add(block.title, path, 'title');
        block.rows.forEach((row, rowIndex) => row.cells.forEach((cell, cellIndex) => {
          add(cell.text, path, `cell:${rowIndex},${cellIndex}`);
        }));
        break;
      case 'pageBlockDetails':
        add(block.title, path, 'title');
        collect(block.blocks, path);
        break;
      case 'pageBlockPhoto':
      case 'pageBlockVideo':
      case 'pageBlockAudio':
      case 'pageBlockMap':
        addCaption(block.caption, path);
        break;
      case 'pageBlockCollage':
      case 'pageBlockSlideshow':
        collect(block.items, path);
        addCaption(block.caption, path);
        break;
      case 'pageBlockUnsupported':
        unknown = true;
        break;
    }
  });
  collect(blocks, []);
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

/** What a quote may carry: a button as its label, no pictures */
function normalizeRichQuoteFragment(text: RichText): RichText | undefined {
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
