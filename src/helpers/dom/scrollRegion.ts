/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex^="-"])',
  '[contenteditable]:not([contenteditable="false"])'
].join(',');

/**
 * A scrolling region belongs in the tab order only when its content cannot be
 * reached any other way — a chat history, an article, a panel of plain text.
 * A panel full of controls already scrolls as Tab walks through them, so an
 * extra stop on the wrapper is a tab stop on a layout element: it shows an
 * outline around the whole panel and announces nothing.
 *
 * Call this once the region's content exists. When the region does take focus
 * it is named, so assistive technology can say what is being scrolled.
 */
export default function updateScrollRegionFocusable(container: HTMLElement, label?: string) {
  if(!container) {
    return;
  }

  if(container.querySelector(FOCUSABLE_SELECTOR)) {
    container.removeAttribute('tabindex');
    container.removeAttribute('role');
    container.removeAttribute('aria-label');
    return;
  }

  container.tabIndex = 0;
  container.setAttribute('role', 'region');
  if(label) {
    container.setAttribute('aria-label', label);
  }
}
