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

export function copyUrlButtonAnchor(anchor: HTMLAnchorElement, element: HTMLElement) {
  anchor.getAttributeNames().forEach((name) => {
    if(name !== 'class') {
      element.setAttribute(name, anchor.getAttribute(name));
    }
  });
}
