import type {RichText} from '@layer';
import type {MessageSendingParams} from '@appManagers/appMessagesManager';
import {alignDrawnText, getTextOffset} from '@components/chat/messageTextCopy';
import {extractText, getTextSkip} from '@helpers/dom/textHighlight';
import clamp from '@helpers/number/clamp';
import fixEmoji from '@lib/richTextProcessor/fixEmoji';
import {
  getRichQuotePage,
  getRichQuoteSource,
  RICH_QUOTE_PAGE_ATTRIBUTE,
  RICH_QUOTE_SOURCE_ATTRIBUTE
} from '@components/chat/richQuoteSources';
import {
  getRichQuoteNodes,
  getRichQuoteSelectionBoundaries,
  getRichQuoteTextWithEntities,
  makeRichQuote,
  RichQuoteBoundary,
  RichQuoteNode
} from '@lib/richQuote';

/** what a selection takes of a rich message: its texts, and where it starts and ends in them */
export type RichQuoteSelection = {nodes: RichQuoteNode[], start: RichQuoteBoundary, end: RichQuoteBoundary};

const getElement = (node: Node) => node.nodeType === node.ELEMENT_NODE ? node as Element : node.parentElement;

/**
 * What a text of a rich message is drawn as (`wrapTelegramRichText`): a picture or a custom emoji with no text of its
 * own is a character there (`\x01`) and nothing in what the text reads, and an emoji is completed (`fixEmoji`, over
 * the whole text, as `wrapTextWithEntities` does — not in a formula, carried as a marker then) — and where each place
 * in that is in what the text reads. A code block is drawn as it reads
 */
function getDrawnText({text: richText, flat: read, code}: RichQuoteNode) {
  if(code) {
    return {text: read, toFlat: Array.from({length: read.length + 1}, (_, index) => index)};
  }

  // what is drawn before an emoji is completed, a formula held out of that, and where each place of it is read
  let drawn = '', completable = '', flat = 0;
  const drawnToFlat: number[] = [];
  const add = (text: string, reads: number, isFormula?: boolean) => {
    for(let index = 0; index < text.length; ++index) drawnToFlat.push(flat + Math.min(index, reads));
    drawn += text;
    completable += isFormula ? '\x02'.repeat(text.length) : text;
    flat += reads;
  };
  const walk = (richText: RichText) => {
    if(!richText) return;
    switch(richText._) {
      case 'textEmpty':
        break;
      case 'textPlain':
        add(richText.text, richText.text.length);
        break;
      case 'textImage':
        add('\x01', 0);
        break;
      case 'textCustomEmoji': {
        const alt = richText.alt || '';
        add(alt || '\x01', alt.length);
        break;
      }
      // * drawn as its source, as `extractText` reads a formula
      case 'textMath':
        add(richText.source, richText.source.length, true);
        break;
      case 'textConcat':
        richText.texts.forEach(walk);
        break;
      default:
        walk(richText.text);
    }
  };

  walk(richText);
  drawnToFlat.push(flat);

  const completed = fixEmoji(completable);
  let text = '';
  const toFlat: number[] = [];
  for(let index = 0, drawnIndex = 0; index < completed.length; ++index) {
    toFlat.push(drawnToFlat[drawnIndex]);
    // what the completion put in reads nothing
    if(completed[index] === completable[drawnIndex]) text += drawn[drawnIndex++];
    else text += completed[index];
  }

  toFlat.push(flat);
  return {text, toFlat};
}

/**
 * What `range` takes of the rich message it is in, as Telegram for iOS takes it (`richQuoteSelectionBoundaries`): from
 * the first text it takes, as far in as it starts there, to the last one, as far as it goes there — every text between
 * whole, as the message has it. Read off the message as it is drawn now; none if it is in no rich message, or takes
 * none of its texts
 */
export function getRichQuoteSelection(range: Range): RichQuoteSelection {
  const [startPage, endPage] = [range.startContainer, range.endContainer]
  .map((node) => getElement(node)?.closest(`[${RICH_QUOTE_PAGE_ATTRIBUTE}]`));
  const page = startPage || endPage;
  const blocks = page && (!startPage || !endPage || startPage === endPage) && getRichQuotePage(page);
  if(!blocks) {
    return;
  }

  const nodes = getRichQuoteNodes(blocks);
  const indices: Map<string, number> = new Map(nodes.map((node, index) => [node.id, index]));
  const runs: {index: number, from: number, to: number}[] = [];
  page.querySelectorAll<HTMLElement>(`[${RICH_QUOTE_SOURCE_ATTRIBUTE}]`).forEach((element) => {
    const index = range.intersectsNode(element) ? indices.get(getRichQuoteSource(element)) : undefined;
    const node = nodes[index];
    const drawn = node && getDrawnText(node);
    // what is drawn but read otherwise than the message has it (a change of a text shown) is not quoted
    const pieces = drawn && alignDrawnText(element, drawn.text);
    if(!pieces) {
      return;
    }

    const contents = element.ownerDocument.createRange();
    contents.selectNodeContents(element);
    const from = range.compareBoundaryPoints(Range.START_TO_START, contents) <= 0 ?
      0 :
      drawn.toFlat[getTextOffset(pieces, range.startContainer, range.startOffset, false)];
    const to = range.compareBoundaryPoints(Range.END_TO_END, contents) >= 0 ?
      node.flat.length :
      drawn.toFlat[getTextOffset(pieces, range.endContainer, range.endOffset, true)];
    if(to > from) {
      runs.push({index, from, to});
    }
  });

  const boundaries = getRichQuoteSelectionBoundaries(runs);
  return boundaries && {nodes, ...boundaries};
}

/**
 * Where a quote of the rich message drawn in `container` starts in the text the highlight reads of it (`extractText`,
 * `skip` passed by): its offset is counted in the message's texts one after another, a line break between each two,
 * and none of those breaks is drawn — nor is all that is drawn a text of the message (a list's own numbers). As far
 * into the text it starts in as it starts there; as it is, in a message that is not rich
 */
export function getRichQuoteTextOffset(container: HTMLElement, offset: number, skip?: string) {
  const page = container.querySelector(`[${RICH_QUOTE_PAGE_ATTRIBUTE}]`);
  const blocks = page && getRichQuotePage(page);
  if(!blocks) {
    return offset;
  }

  const nodes = getRichQuoteNodes(blocks);
  let index = 0, start = 0;
  while(index < nodes.length - 1 && offset > start + nodes[index].flat.length) {
    start += nodes[index++].flat.length + 1;
  }

  const node = nodes[index];
  const element = node && Array.from(page.querySelectorAll<HTMLElement>(`[${RICH_QUOTE_SOURCE_ATTRIBUTE}]`))
  .find((element) => getRichQuoteSource(element) === node.id);
  const drawn = element && getDrawnText(node);
  const pieces = drawn && alignDrawnText(element, drawn.text);
  if(!pieces?.length) {
    return offset - index;
  }

  // * where it starts in what the text is drawn as: an emoji completed there, a line break drawn as none
  const {toFlat} = drawn;
  let at = 0;
  while(at + 1 < toFlat.length && toFlat[at + 1] <= offset - start) ++at;
  const piece = pieces.find((piece) => piece.end > at) ?? pieces[pieces.length - 1];
  const segment = extractText(container, getTextSkip(skip), {sourceText: true}).segments
  .find((segment) => segment.node === piece.node);
  return segment ? segment.start + (piece.atomic ? 0 : clamp(at - piece.start, 0, piece.end - piece.start)) : offset - index;
}

/** The quote of what a selection took, at most `maxLength` of what it reads; none if it takes nothing */
export function makeRichQuoteOfSelection({nodes, start, end}: RichQuoteSelection, maxLength: number): MessageSendingParams['replyToQuote'] {
  const quote = makeRichQuote(nodes, start, end, maxLength);
  if(!quote) {
    return;
  }

  const {text, entities} = getRichQuoteTextWithEntities(quote.fragments);
  return {text, entities: entities.length ? entities : undefined, offset: quote.offset, rich: quote.fragments};
}
