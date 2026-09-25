import type {RichText} from '@layer';

/**
 * Layer 229's inline buttons, by the element wrapRichText drew for each. Drawing one is all the
 * text does: what a button does depends on the page and the message showing it, so that page
 * finds its buttons here and wires them.
 */
const buttons = new WeakMap<HTMLElement, RichText.textButton>();

export const RICH_TEXT_BUTTON_ATTRIBUTE = 'data-rich-button';
export const RICH_TEXT_BUTTON_SELECTOR = `[${RICH_TEXT_BUTTON_ATTRIBUTE}]`;

export function setRichTextButton(element: HTMLElement, button: RichText.textButton) {
  element.setAttribute(RICH_TEXT_BUTTON_ATTRIBUTE, '');
  buttons.set(element, button);
}

export function getRichTextButton(element: HTMLElement) {
  return buttons.get(element);
}
