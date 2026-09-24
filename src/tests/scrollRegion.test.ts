/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import updateScrollRegionFocusable from '@helpers/dom/scrollRegion';

function scroller(innerHTML: string) {
  const el = document.createElement('div');
  el.classList.add('scrollable', 'scrollable-y');
  el.innerHTML = innerHTML;
  document.body.append(el);
  return el;
}

describe('scroll region focusability', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps a panel of controls out of the tab order', () => {
    // a settings screen: Tab already walks its rows and scrolls it on the way,
    // so an extra stop on the wrapper is an outline around the whole panel
    const el = scroller('<input type="checkbox"><button>Save</button>');
    el.tabIndex = 0;

    updateScrollRegionFocusable(el, 'Notifications');

    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('makes a region with nothing focusable inside reachable, and names it', () => {
    // a reading region — plain text that a keyboard user could not scroll otherwise
    const el = scroller('<p>Some text nobody can focus.</p>');

    updateScrollRegionFocusable(el, 'Terms of Service');

    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute('role')).toBe('region');
    expect(el.getAttribute('aria-label')).toBe('Terms of Service');
  });

  it('ignores disabled and negative-tabindex descendants', () => {
    const el = scroller('<input type="checkbox" disabled><div tabindex="-1">x</div>');

    updateScrollRegionFocusable(el, 'Empty');

    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute('role')).toBe('region');
  });

  it('drops the stop again once the region gains a control', () => {
    const el = scroller('<p>text</p>');
    updateScrollRegionFocusable(el, 'Panel');
    expect(el.tabIndex).toBe(0);

    el.append(document.createElement('button'));
    updateScrollRegionFocusable(el, 'Panel');

    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
  });
});
