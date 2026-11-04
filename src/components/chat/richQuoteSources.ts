import type {PageBlock} from '@layer';

/*
 * What a rich message is drawn from, for a quote of what is selected in it (`richQuoteSelection`): the blocks of the
 * message shown, and which of its texts each element draws (`getRichQuoteNodeId`). What draws them says so; nothing
 * else is in here, so what draws them takes nothing else in.
 */

const sources: WeakMap<Element, () => string> = new WeakMap();
const pages: WeakMap<Element, () => PageBlock[]> = new WeakMap();
export const RICH_QUOTE_SOURCE_ATTRIBUTE = 'data-rich-quote-source';
export const RICH_QUOTE_PAGE_ATTRIBUTE = 'data-rich-quote-page';

/** Says which text of a rich message `element` draws, as long as it draws it */
export function setRichQuoteSource(element: HTMLElement, getId: () => string) {
  sources.set(element, getId);
  element.setAttribute(RICH_QUOTE_SOURCE_ATTRIBUTE, '');
}

/** Says what rich message `element` draws: the blocks of the one shown (a whole one loaded for a part, say) */
export function setRichQuotePage(element: HTMLElement, getBlocks: () => PageBlock[]) {
  pages.set(element, getBlocks);
  element.setAttribute(RICH_QUOTE_PAGE_ATTRIBUTE, '');
}

export const getRichQuoteSource = (element: Element) => sources.get(element)?.();
export const getRichQuotePage = (element: Element) => pages.get(element)?.();
