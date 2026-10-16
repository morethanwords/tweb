import type {TextWithEntities} from '@layer';
import {bindActiveWindowListener} from '@helpers/appWindow';
import {extractText, getTextSkip, TextSegment} from '@helpers/dom/textHighlight';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {sliceTextWithEntities} from '@lib/richTextProcessor/sliceTextWithEntities';

// the message text an element draws, read when it is copied from
type MessageTextSource = () => Pick<TextWithEntities, 'text' | 'entities'>;

const sources: WeakMap<Node, MessageTextSource> = new WeakMap();
const SOURCE_ATTRIBUTE = 'data-message-text-source';

// what a bubble draws among the text that is not a part of it
const NOT_TEXT = '.time';

/**
 * Where each drawn piece stands in the message's text. A line break that the layout draws as the
 * edge of a block (a quote, a code block) is in the text only, a code block's header and the time
 * in the drawing only. Nothing when the two part: a translation shown in place of the text, say.
 */
function alignDrawnText(element: HTMLElement, text: string) {
  const drawn = extractText(element, getTextSkip(`.code-header, ${NOT_TEXT}`), {sourceText: true});
  const pieces: TextSegment[] = [];
  let position = 0;
  for(const segment of drawn.segments) {
    const value = drawn.text.slice(segment.start, segment.end);
    let start = position;
    while(!text.startsWith(value, start) && text[start] === '\n') ++start;
    if(!text.startsWith(value, start)) return;
    pieces.push({...segment, start, end: start + value.length});
    position = start + value.length;
  }

  return text.slice(position).replace(/\n/g, '') ? undefined : pieces;
}

/** The offset in the text of a selection's boundary: one between pieces goes to the side it bounds */
function getTextOffset(pieces: TextSegment[], node: Node, offset: number, isEnd: boolean) {
  const point = node.ownerDocument.createRange();
  point.setStart(node, offset);
  let previous: TextSegment;
  for(const piece of pieces) {
    if(!piece.atomic && piece.node === node) {
      return piece.start + offset;
    }

    // a boundary at an edge of what an atomic piece draws is outside it; inside, the piece goes whole
    if(piece.atomic && piece.node.contains(node)) {
      const drawn = node.ownerDocument.createRange();
      drawn.selectNodeContents(piece.node);
      drawn.setEnd(node, offset);
      if(!drawn.toString()) return piece.start;
      drawn.selectNodeContents(piece.node);
      drawn.setStart(node, offset);
      if(!drawn.toString()) return piece.end;
      return isEnd ? piece.end : piece.start;
    }

    // the piece begins after the boundary
    if(point.comparePoint(piece.node, 0) > 0) {
      return isEnd ? previous?.end ?? piece.start : piece.start;
    }

    previous = piece;
  }

  return previous?.end ?? 0;
}

/** Whether all a range takes beyond `element` is the time: the rest of a bubble (a reply) is the browser's to copy */
function isBeyondOnlyTime(range: Range, element: Element) {
  const beyond = element.ownerDocument.createRange();
  // no text, and nothing drawn otherwise: an emoji's image, a custom emoji, a picture
  const isBlank = () => {
    const contents = beyond.cloneContents();
    contents.querySelectorAll(NOT_TEXT).forEach((time) => time.remove());
    return !contents.textContent.trim() && !contents.querySelector('img, canvas, video, svg, [data-sticker-emoji]');
  };

  // an end set before the start collapses the range: nothing is taken on that side
  beyond.setStart(range.startContainer, range.startOffset);
  beyond.setEnd(element, 0);
  if(!isBlank()) return false;
  beyond.setStart(element, element.childNodes.length);
  beyond.setEnd(range.endContainer, range.endOffset);
  return isBlank();
}

/** The element drawing the one message text a selection is in */
function getSelectedSource(range: Range) {
  for(let node = range.commonAncestorContainer; node; node = node.parentNode) {
    if(sources.has(node)) return node;
  }

  // or wider, inside one message: a triple click takes its whole element, a drag goes on into the time
  const getBubble = (node: Node) => (node.nodeType === node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest('.bubble');
  const bubble = getBubble(range.startContainer);
  if(!bubble || bubble !== getBubble(range.endContainer)) return;
  const elements = Array.from(bubble.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`)).filter((element) => range.intersectsNode(element));
  return elements.length === 1 && isBeyondOnlyTime(range, elements[0]) ? elements[0] : undefined;
}

/**
 * A selection inside one message's text copies that part of the message, as its Copy copies the
 * whole: the message's own text and entities, which a field pastes exactly. The browser's copy of
 * the drawn bubble is styled markup that a field reads only roughly — a date as the local time it
 * shows, a link's underline as underlining, a @username as a link, a code block without its
 * language. Anything else (a selection over several messages, a translation shown) the browser
 * copies as before.
 */
function onCopy(e: ClipboardEvent) {
  const selection = (e.currentTarget as Document).getSelection();
  // several ranges (Firefox's Ctrl+drag) are the browser's to copy: one is all this takes
  if(e.defaultPrevented || !e.clipboardData || selection?.rangeCount !== 1 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const element = getSelectedSource(range);
  const source = element && sources.get(element)();
  const pieces = source?.text && alignDrawnText(element as HTMLElement, source.text);
  if(!pieces) {
    return;
  }

  const start = getTextOffset(pieces, range.startContainer, range.startOffset, false);
  const end = getTextOffset(pieces, range.endContainer, range.endOffset, true);
  if(end <= start) {
    return;
  }

  const {text, html} = prepareTextWithEntitiesForCopying(
    sliceTextWithEntities(source.text, source.entities, start, end, {keepCut: true})
  );
  e.clipboardData.setData('text/plain', text);
  e.clipboardData.setData('text/html', html);
  e.preventDefault();
}

let listen = () => {
  // a popped-out (Document PiP) chat is copied from in its own window
  bindActiveWindowListener((w) => w.document, 'copy', onCopy);
  listen = undefined;
};

/** Says what `element` draws: the message text its children show, as long as it shows it */
export function setMessageTextSource(element: HTMLElement, getSource: MessageTextSource) {
  listen?.();
  sources.set(element, getSource);
  element.setAttribute(SOURCE_ATTRIBUTE, '');
}
