import {bindActiveWindowListener} from '@helpers/appWindow';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {getCopiedRange, isBeyondOnlyTime, NOT_TEXT, writeCopy} from '@components/chat/messageTextCopy';
import {getRichQuotePageElement, getRichQuoteSelection} from '@components/chat/richQuoteSelection';
import {RICH_QUOTE_SOURCE_ATTRIBUTE} from '@components/chat/richQuoteSources';
import {richMessageToPlainMessage} from '@lib/richMessage';
import {sliceRichQuoteBlocks} from '@lib/richQuote';

/** The rich message a range is in: all of it, or all of it but the time beside it (a triple click's) */
function getSelectedPage(range: Range) {
  const page = getRichQuotePageElement(range.commonAncestorContainer);
  if(page) {
    return page;
  }

  const edge = getRichQuotePageElement(range.startContainer) || getRichQuotePageElement(range.endContainer);
  return edge && isBeyondOnlyTime(range, edge) ? edge : undefined;
}

/**
 * Whether the first or the last text of `page` that a range takes something of (more than spaces) stands for none of
 * the message's texts a selection counts — a file's name or caption, a row of buttons, a list's number: the copy would
 * leave out what it takes there. A range's edge between elements is no text: what it takes is read off the texts.
 */
function isEdgeOutsideTexts(range: Range, page: Element) {
  const walker = page.ownerDocument.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let first: Text, last: Text;
  for(let node = walker.nextNode() as Text; node; node = walker.nextNode() as Text) {
    // * the time at the end of the last paragraph is no text at all (`NOT_TEXT`), as at the end of a message's own
    if(node.parentElement.closest(NOT_TEXT)) continue;
    if(!range.intersectsNode(node)) {
      if(first) break;
      continue;
    }

    const to = node === range.endContainer ? range.endOffset : node.data.length;
    const from = node === range.startContainer ? range.startOffset : 0;
    if(node.data.slice(from, to).trim()) {
      first ??= node;
      last = node;
    }
  }

  return !!first && [first, last].some((node) => !node.parentElement.closest(`[${RICH_QUOTE_SOURCE_ATTRIBUTE}]`));
}

/**
 * A selection inside one rich message copies that part of the message, as one in a message's text
 * copies its text and entities (`messageTextCopy`): the blocks it takes beside a flat copy of them
 * (`richMessageToPlainMessage`) for other apps and plain fields. The browser's copy of the drawn
 * message is styled markup that the composer reads only roughly — a heading's weight as bold, a
 * table's cells as lines.
 */
function onCopy(e: ClipboardEvent) {
  const range = getCopiedRange(e);
  const page = range && getSelectedPage(range);
  // * one that starts or ends in text no text of the message stands for is the browser's to copy, that text with it
  const selection = page && !isEdgeOutsideTexts(range, page) && getRichQuoteSelection(range);
  if(!selection) {
    return;
  }

  const blocks = sliceRichQuoteBlocks(selection.blocks, selection.nodes, selection.start, selection.end);
  if(!blocks.length) {
    return;
  }

  const plain = richMessageToPlainMessage({_: 'richMessage', pFlags: {}, blocks, photos: [], documents: []});
  writeCopy(e, prepareTextWithEntitiesForCopying(plain, undefined, blocks));
}

let listen = () => {
  // a popped-out (Document PiP) chat is copied from in its own window
  bindActiveWindowListener((w) => w.document, 'copy', onCopy);
  listen = undefined;
};

/** Copies from rich messages from now on: called by a chat, which draws them */
export function listenRichMessageCopy() {
  listen?.();
}
