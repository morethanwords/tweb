import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

/** Marks the link a link button is: a bubble underlines its links, a button is not underlined. */
export const RICH_BUTTON_LINK_CLASS = 'rich-button-link';

/**
 * A link button opens its link the way a link in the text would — same checks, same handlers —
 * so it wears the attributes wrapRichText gives such a link.
 */
export function createUrlButtonAnchor(url: string) {
  const fragment = wrapRichText(' ', {
    entities: [{
      _: 'messageEntityTextUrl',
      length: 1,
      offset: 0,
      url
    }]
  });

  const anchor = htmlToDocumentFragment(fragment).firstElementChild as HTMLAnchorElement;
  anchor.classList.add(RICH_BUTTON_LINK_CLASS);
  return anchor;
}

const copiedAttributes = new WeakMap<HTMLElement, string[]>();

/** Wears the link's attributes; a button that changed its link drops what the old one had and the new has not. */
export function copyUrlButtonAnchor(anchor: HTMLAnchorElement, element: HTMLElement) {
  const names = anchor.getAttributeNames().filter((name) => name !== 'class');
  copiedAttributes.get(element)?.forEach((name) => {
    if(!names.includes(name)) element.removeAttribute(name);
  });
  names.forEach((name) => element.setAttribute(name, anchor.getAttribute(name)));
  copiedAttributes.set(element, names);
}
