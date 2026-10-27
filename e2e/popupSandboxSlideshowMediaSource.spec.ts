import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {SlideshowMediaSourceHarness, SlideshowSurface} from './fixtures/slideshowMediaSource';

declare global {
  interface Window {
    slideshowMediaSource: SlideshowMediaSourceHarness
  }
}

// The media viewer closes by flying back into the media it was opened from, or - when that media
// is not on screen - by fading where it is. A slideshow keeps its other slides beside the one it
// shows, in the scrolling area but clipped away: paged to one of those in the viewer, closing must
// fade rather than fly to a slide nobody sees. What is clipped is the browser's to lay out (in a
// message the next slide starts on the slideshow's frame), so it is asked here and not in jsdom.

const SURFACES: SlideshowSurface[] = ['instant-view', 'message'];

async function open(page: Page) {
  await page.setViewportSize({width: 1280, height: 860});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async() => {
    const path = '/e2e/fixtures/slideshowMediaSource.ts';
    const {mountSlideshowMediaSource} = await window.e2eImport(path);
    window.slideshowMediaSource = mountSlideshowMediaSource();
  });
  for(const surface of SURFACES) {
    await expect.poll(() => page.evaluate((surface) => window.slideshowMediaSource.count(surface), surface)).toBe(3);
  }
}

test('closes the media viewer into the shown slide only', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);

  for(const surface of SURFACES) {
    const closesInto = () => page.evaluate((surface) => window.slideshowMediaSource.closesInto(surface), surface);
    await expect.poll(closesInto, surface).toEqual([true, false, false]);

    // * paged in the page itself, it shows another slide: that one is closed into instead
    const dots = page.locator(`[data-slideshow-surface="${surface}"] [class*="Slideshow"] button[class*="Dot"]`);
    await dots.nth(1).click();
    await expect.poll(closesInto, surface).toEqual([false, true, false]);
    await dots.nth(2).click();
    await expect.poll(closesInto, surface).toEqual([false, false, true]);
  }

  await page.evaluate(() => window.slideshowMediaSource.destroy());
  expect(errors).toEqual([]);
});
