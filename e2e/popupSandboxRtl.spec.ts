import {expect, Page} from '@playwright/test';
import {closeStory, fontsLoaded, openStory, preparePopupSandbox, takeStoryPart} from './popupSandbox.helpers';
import {test} from './workerContext';

const SHOWN_TIMEOUT = 10_000;
// the popup's own opening transition, and whatever it lays out once it is visible
const LAYOUT_SETTLE = 450;
const TOLERANCE = 1.5;
const MOTION_PROBE = 150;
// a part walks every story twice, so the sweep is split finer than the plain one
const PARTS = Number(process.env.POPUP_STORY_PARTS) || 8;
const SHOWN_PER_STORY = 6;

/*
 * Opens every popup story left to right and then right to left, and asserts the second is the
 * mirror image of the first: every box of the popup that is laid out as a block stands as far from
 * the popup's right edge in RTL as it stood from its left edge in LTR, at the same height.
 *
 * `?rtl=1` would do for one direction; the sandbox's `setDirection` flips the same page so both
 * renders come from one boot. The strings stay English in both, which is the point: identical text
 * keeps every width identical, so any box that moves differently is laid out by a physical
 * coordinate somewhere — a `left`, a `margin-right`, a `translateX` without `--reflect`, a position
 * computed in JS.
 *
 * Not compared, by design:
 * - what sits inside text of its own direction (`dir="auto"`): its inline content follows the text,
 *   not the layout — the box itself is still compared;
 * - an island laid out in its own direction (`dir="ltr"` or `direction: ltr` — media playback, a
 *   phone number, a clock, an encryption key);
 * - inline boxes (they flow with the line, and an English line stays English), what is drawn inside
 *   an `<svg>` or a `<canvas>`, and pictures themselves (stickers included): artwork is never
 *   mirrored and carries optical nudges in physical pixels (its container's place is still compared);
 * - what cannot be seen (`opacity: 0`, outside the popup) and fixed-position boxes, which answer to
 *   the viewport rather than the popup;
 * - what moves on its own: a box with a running animation (sparkles scattered at random, a spinner),
 *   and anything that moved between two looks taken in each direction.
 */

type Box = {path: string, tag: string, cls: string, start: number, top: number, width: number};

function measurePopup(): {width: number, boxes: Box[]} {
  const popup = [...document.querySelectorAll('.popup.active')].pop() as HTMLElement;
  if(!popup) return {width: 0, boxes: []};

  const root = (popup.querySelector('.popup-container') || popup) as HTMLElement;
  const frame = root.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const boxes: Box[] = [];

  const walk = (element: Element, path: string) => {
    const style = getComputedStyle(element);
    if(style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed' || style.opacity === '0') return;
    if(style.animationName !== 'none' && style.animationPlayState === 'running') return;

    if(style.direction !== (rtl ? 'rtl' : 'ltr')) return;

    const dir = element.getAttribute('dir');
    const isPicture = element.tagName === 'IMG' || element.tagName === 'VIDEO' || element.tagName === 'CANVAS' ||
      element.classList.contains('media-sticker-wrapper');
    const rect = element.getBoundingClientRect();
    const isInside = rect.right > frame.left && rect.left < frame.right;
    if(!isPicture && isInside && !style.display.startsWith('inline') && rect.width >= 1 && rect.height >= 1) {
      boxes.push({
        path,
        tag: element.tagName.toLowerCase(),
        cls: (element.getAttribute('class') || '').split(' ').slice(0, 2).join('.'),
        // * from the inline-start edge of the popup, whichever side that is
        start: rtl ? frame.right - rect.right : rect.left - frame.left,
        top: rect.top - frame.top,
        width: rect.width
      });
    }

    if(dir === 'auto' || element instanceof SVGElement || isPicture) return;
    for(let i = 0; i < element.children.length; ++i) {
      walk(element.children[i], path + '>' + i);
    }
  };

  walk(root, '');
  return {width: frame.width, boxes};
}

async function openAndMeasure(page: Page, id: string, dir: 'ltr' | 'rtl') {
  await page.evaluate((dir) => window.popupSandbox.setDirection(dir), dir);
  const error = await openStory(page, id);
  if(error) return {error};

  try {
    await expect.poll(
      () => page.evaluate(() => document.querySelectorAll('.popup.active').length),
      {timeout: SHOWN_TIMEOUT, intervals: [20]}
    ).toBeGreaterThan(0);
  } catch{
    return {error: 'never became visible'};
  }

  await page.waitForTimeout(LAYOUT_SETTLE);
  // * a font that comes in between the two directions changes what it sets: an icon, a hint's digits
  await fontsLoaded(page);
  const first = await page.evaluate(measurePopup);
  await page.waitForTimeout(MOTION_PROBE);
  const second = await page.evaluate(measurePopup);
  // * a box that moved on its own between the two looks says nothing about the layout
  const settled = new Map(second.boxes.map((box) => [box.path, box]));
  first.boxes = first.boxes.filter((box) => {
    const again = settled.get(box.path);
    return again && Math.abs(again.start - box.start) <= TOLERANCE && Math.abs(again.top - box.top) <= TOLERANCE;
  });
  return {measured: first};
}

function compare(ltr: ReturnType<typeof measurePopup>, rtl: ReturnType<typeof measurePopup>) {
  if(Math.abs(ltr.width - rtl.width) > TOLERANCE) {
    return [`the popup is ${ltr.width}px wide in LTR and ${rtl.width}px in RTL`];
  }

  const byPath = new Map(rtl.boxes.map((box) => [box.path, box]));
  const complaints: string[] = [];
  for(const box of ltr.boxes) {
    const mirrored = byPath.get(box.path);
    // * a different element there: the content itself changed between the opens, nothing to compare
    if(!mirrored || mirrored.tag !== box.tag || Math.abs(mirrored.width - box.width) > TOLERANCE) continue;

    const shift = Math.round((mirrored.start - box.start) * 10) / 10;
    if(Math.abs(shift) > TOLERANCE || Math.abs(mirrored.top - box.top) > TOLERANCE) {
      complaints.push(`${box.tag}.${box.cls} (${box.path}) stands ${shift}px off its mirrored place`);
    }
  }

  return complaints;
}

for(let part = 0; part < PARTS; ++part) test(`every popup story is mirrored in RTL (part ${part + 1}/${PARTS})`, async({page}) => {
  test.setTimeout(5 * 60_000);

  // * the panel would take a third of the window, popups centre on what is left
  await preparePopupSandbox(page, false);

  const stories = takeStoryPart(await page.evaluate(() => window.popupSandbox.list()), part, PARTS)
  // * a surface (the sign-in cards, the in-app browser) owns the screen rather than a popup
  .filter((story) => !story.surface);
  expect(stories.length).toBeGreaterThan(0);

  const failed: string[] = [];
  for(const story of stories) {
    const ltr = await openAndMeasure(page, story.id, 'ltr');
    await closeStory(page, story, {timeout: SHOWN_TIMEOUT});
    const rtl = await openAndMeasure(page, story.id, 'rtl');
    await closeStory(page, story, {timeout: SHOWN_TIMEOUT});

    // * opening itself is the plain sweep's business, as are its errors - but that sweep opens in LTR
    // * only, so a story that opens left to right and not right to left fails here
    if(rtl.error && !ltr.error) {
      failed.push(`${story.id}: opens left to right, not right to left: ${rtl.error}`);
      continue;
    }

    if(ltr.error || rtl.error) continue;

    const complaints = compare(ltr.measured, rtl.measured);
    if(complaints.length) {
      failed.push(`${story.id}:\n  ${complaints.slice(0, SHOWN_PER_STORY).join('\n  ')}` +
        (complaints.length > SHOWN_PER_STORY ? `\n  …and ${complaints.length - SHOWN_PER_STORY} more` : ''));
    }
  }

  await page.evaluate(() => window.popupSandbox.setDirection('ltr'));
  expect(failed, `\n${failed.join('\n')}\n`).toEqual([]);
});

/*
 * A value slider runs from the inline start: the same point on its line is a low value left to
 * right and a high one right to left, its fill grows from the right edge there, and ArrowLeft - the
 * key toward its end - raises it. The star reaction's slider stands for every `RangeSelector`.
 */
test('a value slider runs from the right in RTL', async({page}) => {
  await preparePopupSandbox(page, false);

  const readSlider = () => page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('.popup.active .progress-line');
    const filled = line.querySelector('.progress-line__filled').getBoundingClientRect();
    const box = line.getBoundingClientRect();
    return {
      value: +line.querySelector('input').value,
      fillFromLeft: Math.round(filled.left - box.left),
      fillFromRight: Math.round(box.right - filled.right),
      // * a quarter of the way in from the left edge, mid-height
      point: {x: box.left + box.width / 4, y: box.top + box.height / 2}
    };
  });

  const valueAtQuarter = async(dir: 'ltr' | 'rtl') => {
    await page.evaluate((dir) => window.popupSandbox.setDirection(dir), dir);
    expect(await openStory(page, 'starReaction')).toBeNull();
    await expect(page.locator('.popup.active .progress-line')).toBeVisible();
    // * pressed once the popup has come in: Firefox takes no press on a line still moving into place
    let last: string;
    await expect.poll(async() => {
      const {point} = await readSlider();
      const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('.popup.active')).opacity);
      const now = JSON.stringify(point);
      const settled = now === last && opacity === '1';
      last = now;
      return settled;
    }, {intervals: [100]}).toBe(true);
    const {point} = await readSlider();
    await page.mouse.click(point.x, point.y);
    const slider = await readSlider();
    await closeStory(page, {surface: undefined});
    return slider;
  };

  const ltr = await valueAtQuarter('ltr');
  expect(ltr.value).toBeCloseTo(.25, 1);
  expect(ltr.fillFromLeft).toBe(0);

  const rtl = await valueAtQuarter('rtl');
  expect(rtl.value).toBeCloseTo(.75, 1);
  expect(rtl.fillFromRight).toBe(0);

  expect(await openStory(page, 'starReaction')).toBeNull();
  await page.locator('.popup.active .progress-line input').focus();
  const before = (await readSlider()).value;
  await page.keyboard.press('ArrowLeft');
  expect((await readSlider()).value).toBeGreaterThan(before);

  await page.evaluate(() => window.popupSandbox.setDirection('ltr'));
});
