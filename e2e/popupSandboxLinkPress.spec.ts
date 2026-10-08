import {expect, Locator, Page} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * A text link held under the pointer gets a ripple that fills a rounded plate of its own colour
 * (helpers/dom/linkPress.ts), anywhere in the app — here a link in a popup's text. What the eye
 * checks, measured: the ripple is mounted with the press, stays wherever the pointer goes until the
 * link is let go and is gone once its wave has faded; the link itself does not move for it; a link a
 * button carries leaves the press to the button; a finger that only passes over a link (a scroll, a
 * swipe) never lights it up; and without animations the link is simply tinted.
 */

const LINK = '.popup-body a';

async function openLinkStory(page: Page) {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'call/link')).toBeNull();
  const link = page.locator(LINK, {hasText: 'Open call'});
  await expect(link).toBeVisible();
  await keepFromActing(link);
  // the popup slides in: the link is where it is pressed only once it has stopped
  await page.waitForFunction(() => document.querySelector('.popup')
  .getAnimations({subtree: true})
  .every((animation) => animation.playState !== 'running'));
  await installRippleProbe(page);
  return link;
}

/** the press is what is checked: the link must not act on it (a touch acts on mousedown) */
function keepFromActing(link: Locator) {
  return link.evaluate((a) => ['mousedown', 'click'].forEach((type) => a.addEventListener(type, (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  }, {capture: true})));
}

/**
 * Installs `window.rippleOverPlates(link, inline)` in the page: the ripple a held link holds, and where
 * it should be — around all the link's lines, each grown by the plate's reach (the ripple's padding,
 * `.125rem` past the text at its sides, `.0625em` above and below a line of text).
 */
function installRippleProbe(page: Page) {
  return page.evaluate(() => {
    (window as any).rippleOverPlates = (link: Element, inline = true) => {
      const ripple = link.querySelector<HTMLElement>('.link-press-ripple');
      if(!ripple) return null;
      const style = getComputedStyle(ripple);
      const bleedX = parseFloat(style.paddingLeft), bleedY = inline ? parseFloat(style.paddingTop) : 0;
      const lines = [...link.getClientRects()].filter((rect) => rect.width && rect.height);
      const round = (values: number[]) => values.map((value) => Math.round(value));
      const left = Math.min(...lines.map((rect) => rect.left)) - bleedX;
      const top = Math.min(...lines.map((rect) => rect.top)) - bleedY;
      const right = Math.max(...lines.map((rect) => rect.right)) + bleedX;
      const bottom = Math.max(...lines.map((rect) => rect.bottom)) + bleedY;
      const rect = ripple.getBoundingClientRect();
      return {
        bleed: style.paddingLeft,
        ripple: round([rect.left, rect.top, rect.width, rect.height]),
        plates: round([left, top, right - left, bottom - top]),
        // a plate per line the wave is cut to
        cuts: ripple.style.clipPath.match(/M/g)?.length,
        lines: lines.length
      };
    };
  });
}

function readLink(page: Page) {
  return page.locator(LINK, {hasText: 'Open call'}).evaluate((a) => {
    const style = getComputedStyle(a);
    // the glyphs of the line: nothing about the press may move them
    const text: DOMRect[] = [];
    const walker = document.createTreeWalker(a.parentElement, NodeFilter.SHOW_TEXT);
    for(let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      text.push(...range.getClientRects());
    }

    const circle = a.querySelector('.link-press-ripple .c-ripple__circle');
    return {
      pressed: a.classList.contains('is-link-pressed'),
      color: style.color,
      background: style.backgroundColor,
      radius: parseFloat(style.borderTopLeftRadius),
      paddingLeft: style.paddingLeft,
      text: text.map((rect) => [rect.left, rect.top, rect.width, rect.height].map(Math.round)),
      // the press's ripple, mounted for it: its box
      ripples: [...a.querySelectorAll('.link-press-ripple')].map((ripple) => {
        const rect = ripple.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
      }),
      lines: [...a.getClientRects()].map((rect) => [rect.left, rect.top, rect.width, rect.height].map(Math.round)),
      rippling: a.classList.contains('is-link-rippling'),
      wave: circle && getComputedStyle(circle).backgroundColor,
      over: (window as any).rippleOverPlates(a)
    };
  });
}

/** `color(srgb r g b / a)` or `rgba(…)` → [r, g, b, a] in 0…1 */
function parseColor(value: string) {
  const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
  if(srgb) return [+srgb[1], +srgb[2], +srgb[3], srgb[4] === undefined ? 1 : +srgb[4]];
  const rgb = value.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
  return [+rgb[1] / 255, +rgb[2] / 255, +rgb[3] / 255, rgb[4] === undefined ? 1 : +rgb[4]];
}

test('a held text link fills with a ripple of its colour, gone once its wave has faded', async({page}) => {
  const link = await openLinkStory(page);
  const idle = await readLink(page);
  expect(parseColor(idle.background)[3]).toBe(0);
  // no link carries a ripple before it is pressed
  expect(idle.ripples).toEqual([]);

  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = await readLink(page);
  expect(held.pressed).toBe(true);
  expect(held.radius).toBeGreaterThan(0);
  // the ripple alone, no plate under it
  expect(held.rippling).toBe(true);
  expect(held.background).toBe(idle.background);
  // over the plate, which is a little wider than the text — and the text stays put
  expect(held.ripples).toHaveLength(1);
  expect(held.over.bleed).toBe('2px');
  expect(held.over.ripple).toEqual(held.over.plates);
  // the link itself does not change: its box would re-wrap a balanced caption
  expect(held.paddingLeft).toBe(idle.paddingLeft);
  expect(held.lines).toEqual(idle.lines);
  expect(held.text, 'the text moved under the plate').toEqual(idle.text);
  // a wave of the link's own colour, tinted
  await expect.poll(async() => (await readLink(page)).wave).toBeTruthy();
  const [r, g, b, alpha] = parseColor((await readLink(page)).wave);
  const [cr, cg, cb] = parseColor(held.color);
  // 20% of it: no colour of what the link sits in (`.primary` here) takes the wave over
  expect(alpha).toBeCloseTo(.2, 2);
  expect([r, g, b].map((v) => Math.round(v * 255))).toEqual([cr, cg, cb].map((v) => Math.round(v * 255)));

  await page.mouse.up();
  // the wave fades over the plate's shape, which stays with it (the ripple would jump aside without)
  const fading = await readLink(page);
  expect(fading.pressed).toBe(false);
  expect(fading.ripples).toEqual(held.ripples);
  await expect.poll(async() => {
    const {pressed, background, ripples, rippling} = await readLink(page);
    return {pressed, background, ripples, rippling};
  }).toEqual({pressed: false, background: idle.background, ripples: [], rippling: false});
});

test('a link over several lines ripples over all of them, whichever is pressed', async({page}) => {
  await preparePopupSandbox(page, false);
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 160px; font: 16px sans-serif; z-index: 10000; background: #fff';
    host.innerHTML = 'Read <a id="long-link" href="#">a link long enough to run over three lines of this box</a> now';
    host.addEventListener('click', (e) => e.preventDefault());
    document.body.append(host);
  });

  await installRippleProbe(page);
  const read = () => page.evaluate(() => (window as any).rippleOverPlates(document.getElementById('long-link')));

  const last = await page.evaluate(() => {
    const rects = [...document.getElementById('long-link').getClientRects()];
    const rect = rects[rects.length - 1];
    return {x: rect.left + 4, y: rect.top + rect.height / 2};
  });
  await page.mouse.move(last.x, last.y);
  await page.mouse.down();
  const held = await read();
  expect(held.lines).toBeGreaterThan(2);
  expect(held.ripple).toEqual(held.plates);
  expect(held.cuts).toBe(held.lines);
  await page.mouse.up();
});

test('without animations the held link is simply tinted', async({page}) => {
  const link = await openLinkStory(page);
  const idle = await readLink(page);
  await page.evaluate(() => (window as any).liteMode.isAvailable = () => false);
  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = await readLink(page);
  expect(held.pressed).toBe(true);
  expect(held.ripples).toEqual([]);
  expect(parseColor(held.background)[3]).toBeGreaterThan(0);
  await page.mouse.up();
  const released = await readLink(page);
  expect(released.pressed).toBe(false);
  expect(released.background).toBe(idle.background);
});

test('a held link keeps its ripple wherever the pointer goes, until it is let go', async({page}) => {
  const link = await openLinkStory(page);
  const box = await link.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  const held = await readLink(page);
  expect(held.pressed).toBe(true);

  // along the link (a selection made from it), then off it onto the text before it — and well past
  // the wave's own life
  await page.mouse.move(box.x + 28, y, {steps: 4});
  await page.mouse.move(box.x - 40, y, {steps: 4});
  await page.waitForTimeout(1000);
  const moved = await readLink(page);
  expect(moved.pressed).toBe(true);
  expect(moved.ripples).toEqual(held.ripples);

  await page.mouse.up();
  await expect.poll(async() => {
    const {pressed, rippling, ripples} = await readLink(page);
    return {pressed, rippling, ripples};
  }).toEqual({pressed: false, rippling: false, ripples: []});
});

test('a context menu over a held link lets it go', async({page}) => {
  const link = await openLinkStory(page);
  const box = await link.boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  expect((await readLink(page)).pressed).toBe(true);
  // a Ctrl+click on macOS: the menu takes the pointer, and no pointerup need follow
  await link.evaluate((a) => a.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true})));
  await expect.poll(async() => {
    const {pressed, rippling} = await readLink(page);
    return {pressed, rippling};
  }).toEqual({pressed: false, rippling: false});
  await page.mouse.up();
});

test('a name in a bubble ripples past its text, as far as its line lets it', async({page}) => {
  await preparePopupSandbox(page, false);
  // the app's own bubble styles: `.name` cuts off what overflows it (it keeps an ellipsis), and so
  // does the row a name shares with its rank
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 360px; z-index: 10000';
    host.innerHTML = '<div class="bubble is-in is-group-first must-have-name"><div class="bubble-content">' +
      '<div class="name colored-name"><a id="bubble-name" class="peer-title" href="#1">Bubble name</a></div>' +
      '<div class="name colored-name"><div class="title-flex">' +
      '<a id="ranked-name" class="peer-title bubble-name-first" href="#2">Ranked name</a>' +
      '<span class="bubble-name-rank">admin</span>' +
      '</div></div>' +
      '</div></div>';
    host.addEventListener('click', (e) => e.preventDefault());
    document.body.append(host);
  });
  await installRippleProbe(page);
  // WebKit has no clip margin: there the plate stops at the line's edge
  const clipMargin = await page.evaluate(() => CSS.supports('overflow-clip-margin', '2px'));

  for(const id of ['bubble-name', 'ranked-name']) {
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const held = await page.evaluate((id) => {
      const link = document.getElementById(id);
      return {
        over: (window as any).rippleOverPlates(link, getComputedStyle(link).display === 'inline'),
        lineLeft: Math.round(link.closest('.name').getBoundingClientRect().left)
      };
    }, id);
    expect(held.over, id).toBeTruthy();
    if(clipMargin) {
      expect(held.over.ripple, id).toEqual(held.over.plates);
    } else {
      expect(held.over.ripple[0], id).toBe(held.lineLeft);
    }

    await page.mouse.up();
  }
});

test('a link a button carries leaves the press to the button', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'instantView/layer229')).toBeNull();
  const anchor = page.locator('[data-rich-button] a', {hasText: 'the docs'});
  await expect(anchor).toBeVisible();
  await keepFromActing(anchor);
  const box = await anchor.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await anchor.evaluate((a) => a.className)).not.toContain('is-link-pressed');
  await page.mouse.up();
});

test('a name is pressed as a link, and nothing beside it moves', async({page}) => {
  await preparePopupSandbox(page, false);
  // the shapes a name in a bubble comes in: a link (PeerTitle `link`) in the line of the text and in a
  // row that pushes the rank to its end; "via @bot", which is no link but is marked to be pressed as
  // one (TEXT_LINK_ATTRIBUTE of helpers/dom/linkPress.ts)
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 400px; font: 16px sans-serif; z-index: 10000; background: #fff';
    host.innerHTML = '<div><a id="inline-name" class="peer-title" href="#1">Inline name</a> wrote</div>' +
      // the rank is kept away by a class, as `.bubble-name-first` does
      '<style>.row-first { margin-right: auto; }</style>' +
      '<div style="display: flex"><a id="row-name" class="peer-title row-first" href="#2">Row name</a><span id="rank">admin</span></div>' +
      '<div>via <span id="via-name" class="peer-title" data-text-link>@bot</span></div>';
    host.addEventListener('click', (e) => e.preventDefault());
    document.body.append(host);
  });

  await installRippleProbe(page);
  const read = () => page.evaluate(() => {
    const textPosition = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode());
      const rect = range.getBoundingClientRect();
      return [rect.left, rect.top].map(Math.round);
    };
    const describe = (id: string) => {
      const element = document.getElementById(id);
      const style = getComputedStyle(element);
      return {
        pressed: element.classList.contains('is-link-pressed'),
        over: (window as any).rippleOverPlates(element, style.display === 'inline'),
        paddingLeft: style.paddingLeft,
        text: textPosition(element)
      };
    };
    return {
      'inline-name': describe('inline-name'),
      'row-name': describe('row-name'),
      'via-name': describe('via-name'),
      rank: textPosition(document.getElementById('rank'))
    };
  });

  const idle = await read();
  for(const id of ['inline-name', 'row-name', 'via-name'] as const) {
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const held = await read();
    expect(held[id].pressed, id).toBe(true);
    expect(held[id].over?.ripple, id).toEqual(held[id].over?.plates);
    // a plate a little wider than the name, which stays put (as does the rank beside it)
    expect(held[id].over.bleed, id).toBe('2px');
    expect(held[id].paddingLeft, id).toBe(idle[id].paddingLeft);
    expect(held[id].text, `${id}: the name moved`).toEqual(idle[id].text);
    expect(held.rank, `${id}: the rank moved`).toEqual(idle.rank);
    await page.mouse.up();
  }
});

test.describe('by touch', () => {
  test.use({freshContext: true, hasTouch: true});

  test('a tap ripples, a finger passing over the link does not, a held one does', async({page, browserName}) => {
    test.skip(browserName !== 'chromium', 'touches are dispatched over CDP');
    const link = await openLinkStory(page);
    await link.evaluate((a) => {
      (window as any).linkPressLog = [];
      new MutationObserver(() => (window as any).linkPressLog.push(a.className))
      .observe(a, {attributes: true, attributeFilter: ['class']});
    });
    const takeLog = () => page.evaluate(() => (window as any).linkPressLog.splice(0) as string[]);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: type === 'touchEnd' ? [] : [{x, y}]
    });
    const box = await link.boundingBox();
    const x = box.x + 4, y = box.y + box.height / 2;

    await touch('touchStart', x, y);
    await touch('touchEnd');
    await expect.poll(takeLog).toEqual(expect.arrayContaining([expect.stringContaining('is-link-rippling')]));

    // the tap's wave gone, and the plate's shape with it
    await expect.poll(() => link.evaluate((a) => a.className)).not.toMatch(/is-link-(pressed|rippling)/);
    await takeLog();
    await touch('touchStart', x, y);
    for(let step = 1; step <= 5; ++step) {
      await touch('touchMove', x + step * 6, y + step * 6);
    }
    await touch('touchEnd');
    await page.waitForTimeout(300);
    expect(await takeLog(), 'a passing finger lit the link up').toEqual([]);

    // a finger held still: the ripple comes before it is lifted, and stays until then
    await touch('touchStart', x, y);
    await expect.poll(() => link.evaluate((a) => a.className)).toContain('is-link-rippling');
    await page.waitForTimeout(800);
    expect(await link.evaluate((a) => a.className)).toContain('is-link-pressed');
    await touch('touchEnd');
    await expect.poll(() => link.evaluate((a) => a.className)).not.toMatch(/is-link-(pressed|rippling)/);
  });
});
