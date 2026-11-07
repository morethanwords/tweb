import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const frames = vi.hoisted(() => [] as (() => void)[]);
vi.mock('@helpers/schedulers', () => ({
  fastRaf: (callback: () => void) => frames.push(callback),
  fastRafPromise: () => Promise.resolve()
}));
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => true}}));
vi.mock('@hooks/useHeavyAnimationCheck', () => ({dispatchHeavyAnimationEvent: (promise: Promise<any>) => promise}));

import fastSmoothScroll from '@helpers/fastSmoothScroll';
import {cancelAnimationByKey} from '@helpers/animation';

const runFrame = () => frames.splice(0).forEach((callback) => callback());

const makeRect = (top: number, height: number) => ({
  top,
  bottom: top + height,
  height,
  left: 0,
  right: 0,
  width: 0,
  x: 0,
  y: top,
  toJSON: () => ({})
}) as DOMRect;

/**
 * A scroller of `viewport` px showing a content of `contentHeight` px, the element at `top` in it, `size` tall: what a
 * widget starting near it changes as the scroll goes on.
 */
function setup(layout: {viewport: number, contentHeight: number, top: number, size: number, scrollTop?: number}) {
  const container = document.createElement('div');
  const element = document.createElement('div');
  container.append(element);
  document.body.append(container);

  let scrollTop = layout.scrollTop ?? 0;
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => scrollTop = Math.min(Math.max(0, value), Math.max(0, layout.contentHeight - layout.viewport))
  });
  Object.defineProperty(container, 'scrollHeight', {configurable: true, get: () => layout.contentHeight});
  container.getBoundingClientRect = () => makeRect(0, layout.viewport);
  Object.defineProperty(element, 'scrollHeight', {configurable: true, get: () => layout.size});
  element.getBoundingClientRect = () => makeRect(layout.top - scrollTop, layout.size);

  return {container, element};
}

describe('a scroll that follows its element', () => {
  let container: HTMLElement;

  beforeEach(() => {
    frames.length = 0;
  });

  afterEach(() => {
    cancelAnimationByKey(container);
    container?.remove();
  });

  it('stays with an element it has nothing to scroll to, and centres it once the scroll can', async() => {
    // * centred, it would be scrolled to -50: it stays where it is, at the content's start
    const layout = {viewport: 400, contentHeight: 2000, top: 100, size: 100};
    const scene = setup(layout);
    container = scene.container;
    await fastSmoothScroll({container, element: scene.element, position: 'center', axis: 'y', forceDuration: 0, follow: true});
    expect(container.scrollTop).toBe(0);

    // * a widget above it grows: now it can be centred
    layout.top = 300;
    runFrame();
    expect(container.scrollTop).toBe(150);
  });

  it('lands where the element is aligned within what can be scrolled now, not by the clip it had as it started', async() => {
    const layout = {viewport: 400, contentHeight: 2000, top: 100, size: 100, scrollTop: 300};
    const scene = setup(layout);
    container = scene.container;
    // * centred, it would be scrolled to -50: the content's start
    await fastSmoothScroll({container, element: scene.element, position: 'center', axis: 'y', forceDuration: 0, follow: true});
    expect(container.scrollTop).toBe(0);

    layout.top = 300;
    runFrame();
    expect(container.scrollTop).toBe(150);
  });

  it('centres the element by the size it has now', async() => {
    const layout = {viewport: 800, contentHeight: 4000, top: 1000, size: 160};
    const scene = setup(layout);
    container = scene.container;
    await fastSmoothScroll({container, element: scene.element, position: 'center', axis: 'y', forceDuration: 0, follow: true});
    expect(container.scrollTop).toBe(1000 + 80 - 400);

    // * the widget it is grows where it stands
    layout.size = 600;
    runFrame();
    expect(container.scrollTop).toBe(1000 + 300 - 400);

    // * taller than the screen: by its start
    layout.size = 1000;
    runFrame();
    expect(container.scrollTop).toBe(1000);
  });

  it('centres the part a jump is about once the bubble it is in grows taller than the screen, as it is now', async() => {
    // * a bubble with a widget above its caption, the caption the jump is about (a search's match): the bubble fits
    const layout = {viewport: 400, contentHeight: 4000, top: 1000, size: 180};
    const caption = {offset: 150, height: 30};
    const scene = setup(layout);
    container = scene.container;
    // * as the chat measures it (ChatBubbles.measureFocus): none while the bubble fits, or its start shows the part
    const getFocus = () => layout.size < layout.viewport || caption.offset + caption.height <= layout.viewport ?
      undefined :
      caption;
    await fastSmoothScroll({container, element: scene.element, position: 'center', axis: 'y', forceDuration: 0, follow: true, getFocus});
    expect(container.scrollTop).toBe(1000 + 90 - 200);

    // * the widget starts: the bubble outgrows the screen, the caption goes down in it
    layout.size = 620;
    caption.offset = 590;
    runFrame();
    expect(container.scrollTop).toBe(1000 + 590 + 15 - 200);

    // * a plain jump to the bubble keeps to its start then
    const plain = setup({viewport: 400, contentHeight: 4000, top: 1000, size: 180});
    await fastSmoothScroll({container: plain.container, element: plain.element, position: 'center', axis: 'y', forceDuration: 0, follow: true});
    Object.defineProperty(plain.element, 'scrollHeight', {configurable: true, get: () => 620});
    runFrame();
    expect(plain.container.scrollTop).toBe(1000);
    cancelAnimationByKey(plain.container);
    plain.container.remove();
  });

  it('goes where the part is as the scroll starts, and keeps to it from there', async() => {
    // * the jump asked for while the bubble fitted; by the time the scroll starts (a frame later) its widget has grown
    const layout = {viewport: 400, contentHeight: 4000, top: 1000, size: 180};
    const caption = {offset: 150, height: 30};
    const scene = setup(layout);
    container = scene.container;
    const getFocus = () => layout.size < layout.viewport || caption.offset + caption.height <= layout.viewport ?
      undefined :
      caption;
    // * the scroll's clock is the test's: its frames come when the test runs them, each past its millisecond
    let now = 10_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      // * a scroll that is not a jump starts a frame later: the widget grows before it
      const scrolled = fastSmoothScroll({container, element: scene.element, position: 'center', axis: 'y', forceDuration: 1, follow: true, getFocus});
      layout.size = 620;
      caption.offset = 590;
      let settled = false;
      scrolled.then(() => settled = true);
      for(let i = 0; i < 10 && !settled; i++) {
        await Promise.resolve();
        now += 10;
        runFrame();
        await Promise.resolve();
      }

      await scrolled;
      expect(container.scrollTop).toBe(1000 + 590 + 15 - 200);
    } finally {
      clock.mockRestore();
    }

    // * and stays with it as it moves on
    caption.offset = 640;
    layout.size = 670;
    runFrame();
    expect(container.scrollTop).toBe(1000 + 640 + 15 - 200);
  });

  it('goes after what moved the element between the scroll\'s last frame and the follow taking over', async() => {
    const layout = {viewport: 400, contentHeight: 4000, top: 1000, size: 100};
    const scene = setup(layout);
    container = scene.container;
    let now = 10_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const scrolled = fastSmoothScroll({container, element: scene.element, position: 'start', axis: 'y', forceDuration: 1, follow: true});
      // * the scroll starts (a frame later), and its one frame past its millisecond lands it
      await Promise.resolve();
      now += 10;
      runFrame();
      expect(container.scrollTop).toBe(1000);

      // * a widget above grows before the follow takes over (the scroll's promise settles a microtask later)
      layout.top = 1200;
      await scrolled;
      runFrame();
      expect(container.scrollTop).toBe(1200);
    } finally {
      clock.mockRestore();
    }
  });

  it('starts by the date group a tall bubble opens while its part shows from there, then follows the part', async() => {
    const layout = {viewport: 400, contentHeight: 4000, top: 1000, size: 500};
    const caption = {offset: 300, height: 30};
    const scene = setup(layout);
    container = scene.container;
    // * the date group the bubble opens: its start 50 px above the bubble's
    const group = document.createElement('div');
    container.append(group);
    group.getBoundingClientRect = () => makeRect(950 - container.scrollTop, 50);
    // * as the chat measures it: none while the part shows with the group's start at the top
    const getFocus = () => layout.size < layout.viewport || layout.top + caption.offset + caption.height - 950 <= layout.viewport ?
      undefined :
      caption;
    await fastSmoothScroll({
      container,
      element: scene.element,
      position: 'center',
      axis: 'y',
      forceDuration: 0,
      follow: true,
      fallbackToElementStartWhenCentering: group,
      getFocus
    });
    expect(container.scrollTop).toBe(950);

    // * the widget above the caption grows: the caption no longer shows from the group's start
    layout.size = 900;
    caption.offset = 700;
    runFrame();
    expect(container.scrollTop).toBe(1000 + 700 + 15 - 200);
  });

  it('keeps an element aligned by its start where something above it grows', async() => {
    const layout = {viewport: 400, contentHeight: 3000, top: 600, size: 100, scrollTop: 600};
    const scene = setup(layout);
    container = scene.container;
    // * there already
    await fastSmoothScroll({container, element: scene.element, position: 'start', axis: 'y', forceDuration: 0, follow: true});
    expect(container.scrollTop).toBe(600);

    layout.top = 750;
    runFrame();
    expect(container.scrollTop).toBe(750);
  });
});
