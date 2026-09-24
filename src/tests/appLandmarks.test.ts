/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachSkipToContent, setLandmarkLabels} from '@helpers/dom/appLandmarks';

function build() {
  document.body.innerHTML = `
    <a class="sr-only sr-only-focusable" href="#column-center" id="skip-to-content" hidden></a>
    <div id="column-left" role="navigation"></div>
    <div id="column-center" role="main" tabindex="-1"></div>
    <div id="column-right" role="complementary"></div>
  `;

  return {
    link: document.getElementById('skip-to-content') as HTMLAnchorElement,
    left: document.getElementById('column-left'),
    center: document.getElementById('column-center'),
    right: document.getElementById('column-right')
  };
}

describe('app landmarks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    location.hash = '';
  });

  it('gives the skip link a localized name instead of hardcoded English', () => {
    const {link, center} = build();
    expect(link.textContent).toBe('');

    attachSkipToContent(link, center);

    expect(link.textContent.length).toBeGreaterThan(0);
  });

  it('stays hidden until it is named, so no empty link sits in the tab order', () => {
    const {link, center} = build();
    // the auth screen never reaches appImManager.construct, so the link must not
    // be exposed there at all — axe `link-name` fails on an unnamed link
    expect(link.hidden).toBe(true);

    attachSkipToContent(link, center);

    expect(link.hidden).toBe(false);
  });

  it('moves focus to the main column and does not touch the hash', () => {
    const {link, center} = build();
    attachSkipToContent(link, center);

    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    link.dispatchEvent(event);

    expect(document.activeElement).toBe(center);
    // the whole point: following the href would run the deep-link router
    expect(event.defaultPrevented).toBe(true);
    expect(location.hash).toBe('');
  });

  it('keeps the href so it stays a real link for assistive technology', () => {
    const {link} = build();
    expect(link.getAttribute('href')).toBe('#column-center');
  });

  it('names the navigation and complementary landmarks', () => {
    const {left, right} = build();
    expect(left.hasAttribute('aria-label')).toBe(false);

    setLandmarkLabels(left, right);

    expect(left.getAttribute('aria-label').length).toBeGreaterThan(0);
    expect(right.getAttribute('aria-label').length).toBeGreaterThan(0);
    expect(left.getAttribute('aria-label')).not.toBe(right.getAttribute('aria-label'));
  });
});
