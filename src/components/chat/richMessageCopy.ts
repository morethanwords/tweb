import {bindActiveWindowListener} from '@helpers/appWindow';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {getCopiedRange, isBeyondOnlyTime, writeCopy} from '@components/chat/messageTextCopy';
import {getElement, getRichQuoteSelection} from '@components/chat/richQuoteSelection';
import {RICH_QUOTE_PAGE_ATTRIBUTE} from '@components/chat/richQuoteSources';
import {richMessageToPlainMessage} from '@lib/richMessage';
import {sliceRichQuoteBlocks} from '@lib/richQuote';

const getPage = (node: Node) => getElement(node)?.closest(`[${RICH_QUOTE_PAGE_ATTRIBUTE}]`);

/** The rich message a range is in: all of it, or all of it but the time beside it (a triple click's) */
function getSelectedPage(range: Range) {
  const page = getPage(range.commonAncestorContainer);
  if(page) {
    return page;
  }

  const edge = getPage(range.startContainer) || getPage(range.endContainer);
  return edge && isBeyondOnlyTime(range, edge) ? edge : undefined;
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
  const selection = range && getSelectedPage(range) && getRichQuoteSelection(range);
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
