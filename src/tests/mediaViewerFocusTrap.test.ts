import {afterEach, describe, expect, it} from 'vitest';
import createFocusTrap from '@helpers/dom/focusTrap';
import createViewerFocusTrap from '@components/mediaViewer/viewerFocusTrap';
import Modes from '@config/modes';
import '@/tests/helpers/a11yLayer';
import makeVisible from '@/tests/helpers/makeVisible';

const mounted: HTMLElement[] = [];
const traps: {release(): void}[] = [];

afterEach(() => {
  traps.splice(0).forEach((trap) => trap.release());
  Modes.a11y = true;
  mounted.splice(0).forEach((element) => element.remove());
});

function button(name: string) {
  const element = document.createElement('button');
  element.textContent = name;
  return makeVisible(element);
}

// * a page with the tile that opened the viewer, and the viewer over it holding the focus, as the viewer does
function open() {
  const opener = button('tile');
  const viewer = document.createElement('div');
  viewer.tabIndex = -1;
  const first = button('forward'), last = button('close');
  viewer.append(first, last);
  document.body.append(opener, viewer);
  mounted.push(opener, viewer);
  opener.focus();
  viewer.focus();
  const focus = createViewerFocusTrap(viewer);
  focus.hold(opener);
  traps.push(focus);
  return {opener, viewer, first, last, focus};
}

function tab(shiftKey = false) {
  const target = document.activeElement || document.body;
  const event = new KeyboardEvent('keydown', {key: 'Tab', shiftKey, bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

// * what a popup does over the page: its own trap, on top of the viewer's
function openPopup() {
  const popup = document.createElement('div');
  const field = button('ok');
  popup.append(field);
  document.body.append(popup);
  mounted.push(popup);
  const trap = createFocusTrap(popup);
  trap.activate();
  traps.push({release: () => trap.deactivate(false)});
  return {popup, field, trap};
}

describe('the media viewer keeps the keyboard focus', () => {
  it('Tab and Shift+Tab go round its controls, and the focus sent out comes back', () => {
    const {viewer, first, last} = open();
    expect(viewer.contains(document.activeElement)).toBe(true);

    last.focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(last);

    const outside = button('page');
    document.body.append(outside);
    mounted.push(outside);
    outside.focus();
    expect(viewer.contains(document.activeElement)).toBe(true);
  });

  it('lets go as it closes, leaving the focus for the viewer to give back once it is gone', () => {
    const {first, focus} = open();
    first.focus();
    focus.release();
    expect(document.activeElement).toBe(first);

    const page = button('page');
    document.body.append(page);
    mounted.push(page);
    page.focus();
    expect(document.activeElement).toBe(page);
    expect(tab()).toBe(false);
  });

  it('steps aside while its video plays in its own window, and holds the focus again when it comes back', () => {
    const {viewer, focus} = open();
    focus.stepAside(true);
    const page = button('page');
    document.body.append(page);
    mounted.push(page);
    page.focus();
    expect(document.activeElement).toBe(page);
    expect(tab()).toBe(false);

    // * hidden, the viewer's control lost the focus to the page's body
    page.blur();
    focus.stepAside(false);
    expect(viewer.contains(document.activeElement)).toBe(true);
    page.focus();
    expect(viewer.contains(document.activeElement)).toBe(true);
  });

  it('back from its own window, leaves the focus to a popup opened over the page meanwhile', () => {
    const {viewer, focus} = open();
    focus.stepAside(true);
    const {field, trap} = openPopup();
    expect(document.activeElement).toBe(field);

    focus.stepAside(false);
    expect(document.activeElement).toBe(field);
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(viewer.contains(document.activeElement)).toBe(false);
    trap.deactivate();
  });

  it('a popup opened over it takes the focus and gives it back to the viewer', () => {
    const {viewer, last} = open();
    last.focus();
    const {field, trap} = openPopup();
    expect(document.activeElement).toBe(field);
    trap.deactivate();
    expect(document.activeElement).toBe(last);
    expect(viewer.contains(document.activeElement)).toBe(true);
  });

  // * the browser keeps the focus in a full screen element itself, and the controls left behind take none: sent there,
  // * Tab would go nowhere
  it('leaves Tab to the browser while its video is in full screen', () => {
    const {viewer, first} = open();
    const player = document.createElement('div');
    const exit = button('exit full screen');
    player.append(button('play'), exit);
    viewer.append(player);
    let fullScreen: Element = player;
    Object.defineProperty(document, 'fullscreenElement', {configurable: true, get: () => fullScreen});
    try {
      exit.focus();
      expect(tab()).toBe(false);
      expect(document.activeElement).toBe(exit);

      // * out of full screen, the last control goes round to the first again
      fullScreen = null;
      expect(tab()).toBe(true);
      expect(document.activeElement).toBe(first);
    } finally {
      delete (document as any).fullscreenElement;
    }
  });

  it('without the keyboard layer, holds nothing', () => {
    Modes.a11y = false;
    const {viewer} = open();
    const page = button('page');
    document.body.append(page);
    mounted.push(page);
    page.focus();
    expect(document.activeElement).toBe(page);
    expect(viewer.contains(document.activeElement)).toBe(false);
  });
});
