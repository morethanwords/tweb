import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';

// Where a hidden spoiler's dots go is the browser's layout: jsdom lays nothing out, so the lines of a
// spoiler are measured here, inside a box that clips them the way a collapsed quote or a closed
// details does. The sandbox page is only a host with the app's modules.

type Line = {top: number, height: number};

async function measure(page: Page, clipHeight?: number): Promise<Line[]> {
  return page.evaluate(async(clipHeight) => {
    const path = '/src/components/messageSpoilerOverlay/utils.ts';
    const {getCustomDOMRectsForSpoilerSpan} = await import(/* @vite-ignore */ path);
    const message = document.createElement('div');
    message.style.cssText = 'position:absolute;left:0;top:0;width:200px;font:16px/20px sans-serif;background:white;z-index:2;';
    const box = document.createElement('div');
    if(clipHeight !== undefined) box.style.cssText = `overflow:hidden;height:${clipHeight}px;`;
    const span = document.createElement('span');
    span.textContent = 'a spoiler long enough to wrap over three lines of its message, at least';
    box.append(span);
    message.append(box);
    document.body.append(message);
    const lines = getCustomDOMRectsForSpoilerSpan(span, message.getBoundingClientRect(), message);
    message.remove();
    return lines.map(({top, height}: Line) => ({top, height}));
  }, clipHeight);
}

test.beforeEach(async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
});

test('a spoiler that nothing clips is drawn over every line it takes', async({page}) => {
  const lines = await measure(page);
  expect(lines.length).toBeGreaterThanOrEqual(3);
  lines.slice(1).forEach((line, index) => expect(line.top - lines[index].top).toBe(20));
});

test('a clipping box keeps a spoiler\'s dots to what it shows, and a closed one to nothing', async({page}) => {
  const [first, second] = await measure(page);
  // 30px of 20px lines: the first one whole, the second one cut
  const clipped = await measure(page, 30);
  expect(clipped).toHaveLength(2);
  // a glyph box may stick out of its line by a pixel (Firefox's does), which the box cuts too
  expect(clipped[0].top).toBeGreaterThanOrEqual(0);
  expect(Math.abs(clipped[0].top - first.top)).toBeLessThanOrEqual(1);
  expect(clipped[1].top).toBe(second.top);
  expect(clipped[1].height).toBeLessThan(second.height);
  // the overlay rounds a rect out by a pixel
  expect(clipped[1].top + clipped[1].height).toBeLessThanOrEqual(31);

  expect(await measure(page, 0)).toEqual([]);
});
