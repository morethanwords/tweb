import {expect, Locator, Page} from '@playwright/test';
import {test} from './workerContext';
import {fontsLoaded, openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * A text link held under the pointer gets a ripple that fills a rounded plate of its own colour
 * (helpers/dom/linkPress.ts), anywhere in the app — here a link in a popup's text; the plate stays,
 * lightly, while a menu opened from the link is open, and under the mouse the link is underlined.
 * What the eye checks, measured: the plate is mounted for the press or the menu, its ripple stays
 * wherever the pointer goes until the link is let go, and the plate is gone once nothing draws on
 * it; the link itself does not move for it; a link a button carries leaves the press to the button;
 * a finger that only passes over a link (a scroll, a swipe) never lights it up; and without
 * animations the plate is simply filled.
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
  await fontsLoaded(page);
  await installPlateProbe(page);
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
 * Installs `window.plateOverLines(link, inline)` in the page: the plate a link wears, and where it
 * should be — around all the link's lines, each grown by the plate's reach (its padding, `.125rem`
 * past the text at its sides, `.0625em` above and below a line of text).
 */
function installPlateProbe(page: Page) {
  return page.evaluate(() => {
    (window as any).plateOverLines = (link: Element, inline = true) => {
      const plate = link.querySelector<HTMLElement>('.link-plate');
      if(!plate) return null;
      const style = getComputedStyle(plate);
      const bleedX = parseFloat(style.paddingLeft), bleedY = inline ? parseFloat(style.paddingTop) : 0;
      const lines = [...link.getClientRects()].filter((rect) => rect.width && rect.height);
      const round = (values: number[]) => values.map((value) => Math.round(value));
      const left = Math.min(...lines.map((rect) => rect.left)) - bleedX;
      const top = Math.min(...lines.map((rect) => rect.top)) - bleedY;
      const right = Math.max(...lines.map((rect) => rect.right)) + bleedX;
      const bottom = Math.max(...lines.map((rect) => rect.bottom)) + bleedY;
      const rect = plate.getBoundingClientRect();
      return {
        bleed: style.paddingLeft,
        plate: round([rect.left, rect.top, rect.width, rect.height]),
        around: round([left, top, right - left, bottom - top]),
        // a plate per line it is cut to
        cuts: plate.style.clipPath.match(/M/g)?.length,
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

    const plate = a.querySelector('.link-plate');
    const circle = plate?.querySelector('.c-ripple__circle');
    const tint = plate && getComputedStyle(plate, '::before');
    return {
      // a plate is mounted in the link, lit (a menu open from it), filled for a press with no ripple
      plated: a.classList.contains('has-link-plate'),
      lit: !!plate?.classList.contains('is-lit'),
      pressed: !!plate?.classList.contains('is-pressed'),
      waves: plate ? plate.querySelectorAll('.c-ripple__circle').length : 0,
      tint: tint && {color: tint.backgroundColor, opacity: +tint.opacity},
      decoration: style.textDecorationLine,
      color: style.color,
      background: style.backgroundColor,
      radius: parseFloat(style.borderTopLeftRadius),
      paddingLeft: style.paddingLeft,
      text: text.map((rect) => [rect.left, rect.top, rect.width, rect.height].map(Math.round)),
      // the plate, mounted for the hover or the press: its box
      plates: [...a.querySelectorAll('.link-plate')].map((plate) => {
        const rect = plate.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
      }),
      lines: [...a.getClientRects()].map((rect) => [rect.left, rect.top, rect.width, rect.height].map(Math.round)),
      wave: circle && getComputedStyle(circle).backgroundColor,
      over: (window as any).plateOverLines(a)
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
  // no link carries a plate before the pointer comes to it
  expect(idle.plates).toEqual([]);

  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = await readLink(page);
  expect(held.plated).toBe(true);
  expect(held.radius).toBeGreaterThan(0);
  // the plate is laid over the link, which is not painted itself
  expect(held.background).toBe(idle.background);
  // a little wider than the text — and the text stays put
  expect(held.plates).toHaveLength(1);
  expect(held.over.bleed).toBe('2px');
  expect(held.over.plate).toEqual(held.over.around);
  // the link itself does not change: its box would re-wrap a balanced caption
  expect(held.paddingLeft).toBe(idle.paddingLeft);
  expect(held.lines).toEqual(idle.lines);
  expect(held.text, 'the text moved under the plate').toEqual(idle.text);
  // a wave of the link's own colour, tinted
  await expect.poll(async() => (await readLink(page)).waves).toBe(1);
  const [r, g, b, alpha] = parseColor((await readLink(page)).wave);
  const [cr, cg, cb] = parseColor(held.color);
  // 20% of it: no colour of what the link sits in (`.primary` here) takes the wave over
  expect(alpha).toBeCloseTo(.2, 2);
  expect([r, g, b].map((v) => Math.round(v * 255))).toEqual([cr, cg, cb].map((v) => Math.round(v * 255)));

  await page.mouse.up();
  // the wave fades over the plate's shape, which stays with it (the ripple would jump aside without),
  // and goes with it, the mouse over the link still
  const fading = await readLink(page);
  expect(fading.plates).toEqual(held.plates);
  await expect.poll(async() => {
    const {plated, background, plates} = await readLink(page);
    return {plated, background, plates};
  }).toEqual({plated: false, background: idle.background, plates: []});
});

test('the mouse over a link underlines it, and draws no plate', async({page}) => {
  const link = await openLinkStory(page);
  const idle = await readLink(page);
  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // underlined, as links are on the web, and nothing else: the plate is for a press or a menu
  expect(idle.decoration).toBe('none');
  await expect.poll(async() => (await readLink(page)).decoration).toBe('underline');
  await page.waitForTimeout(100);
  const hovered = await readLink(page);
  expect({plated: hovered.plated, plates: hovered.plates}).toEqual({plated: false, plates: []});
  // nothing of the link moves for it
  expect(hovered.lines).toEqual(idle.lines);
  expect(hovered.text, 'the text moved under the underline').toEqual(idle.text);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60);
  expect((await readLink(page)).decoration).toBe('none');

  // a pointer dragged over the link with its button down (a selection from the text before it) does
  // not underline it — until the button is let go over it
  await page.mouse.move(box.x - 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 4});
  await page.waitForTimeout(100);
  expect((await readLink(page)).decoration).toBe('none');
  await page.mouse.up();
  expect((await readLink(page)).decoration).toBe('underline');
});

test('every kind of link in a message is underlined under the mouse, a name is not', async({page}) => {
  await preparePopupSandbox(page, false);
  // the app's own bubble styles, and the links a message's text is made of (wrapRichText)
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 420px; z-index: 10000';
    host.innerHTML = '<div class="bubble is-in is-group-first"><div class="bubble-content">' +
      '<div class="name colored-name"><a id="link-name" class="peer-title" href="#1">Sender name</a></div>' +
      '<div class="message spoilers-container">' +
      '<a id="link-url" class="anchor-url" href="https://example.com">example.com</a> ' +
      '<a id="link-hashtag" class="anchor-hashtag" href="#">#hashtag</a> ' +
      '<a id="link-mention" class="mention" href="#">@mention</a> ' +
      '<a id="link-command" href="tg://bot_command?command=start">/start</a> ' +
      '<a id="link-email" href="mailto:a@example.com">a@example.com</a>' +
      '</div></div></div>';
    host.addEventListener('click', (e) => e.preventDefault());
    document.body.append(host);
  });

  const decoration = (id: string) => page.locator(`#${id}`).evaluate((a) => getComputedStyle(a).textDecorationLine);
  for(const id of ['link-hashtag', 'link-mention', 'link-command', 'link-email', 'link-url', 'link-name']) {
    const idle = await decoration(id);
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // a name is drawn as a name; every other link is underlined (a URL in a message is all the time)
    expect(await decoration(id), id).toBe(id === 'link-name' ? 'none' : 'underline');
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    expect(await decoration(id), id).toBe(idle);
  }
});

test('in a dark theme every link of an outgoing message is underlined: it is as white as the text', async({page}) => {
  await preparePopupSandbox(page, false);
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'night';
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 420px; z-index: 10000';
    const message = (side: string) => `<div class="bubble is-${side} is-group-first"><div class="bubble-content">` +
      '<div class="message spoilers-container">' +
      `<a class="anchor-hashtag" href="#">#hashtag</a> <a class="mention" href="#">@mention</a> ` +
      `<a href="tg://bot_command?command=start">/start</a> <a class="anchor-url" href="#">example.com</a>` +
      '</div></div></div>';
    host.innerHTML = message('out') + message('in');
    document.body.append(host);
  });

  const read = (side: string) => page.locator(`.night .bubble.is-${side} .message a`)
  .evaluateAll((links) => links.map((a) => getComputedStyle(a).textDecorationLine));
  expect(await read('out')).toEqual(['underline', 'underline', 'underline', 'underline']);
  // an incoming one's links are in the accent colour: only a URL is underlined, as in a day theme
  expect(await read('in')).toEqual(['none', 'none', 'none', 'underline']);
});

/** what a menu does for the link it was opened from (the chat's context menu, a date's menu) */
function holdPlate(link: Locator) {
  return link.evaluate(async(a) => {
    const {holdLinkPlate} = await window.e2eImport('/src/helpers/dom/linkPress.ts');
    (window as any).releaseLinkPlate = holdLinkPlate(a);
  });
}

test('a menu opened from a link keeps its plate lit until it closes', async({page}) => {
  const link = await openLinkStory(page);
  const idle = await readLink(page);
  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // the menu shows what it was opened on: the press's plate, at half its tint
  await holdPlate(link);
  await expect.poll(async() => (await readLink(page)).tint?.opacity).toBe(.5);
  const held = await readLink(page);
  expect({lit: held.lit, waves: held.waves}).toEqual({lit: true, waves: 0});
  expect(held.over.plate).toEqual(held.over.around);
  const [r, g, b, alpha] = parseColor(held.tint.color);
  const [cr, cg, cb] = parseColor(held.color);
  expect(alpha).toBeCloseTo(.2, 2);
  expect([r, g, b].map((v) => Math.round(v * 255))).toEqual([cr, cg, cb].map((v) => Math.round(v * 255)));
  // nothing of the link moves for it
  expect(held.lines).toEqual(idle.lines);
  expect(held.text, 'the text moved under the plate').toEqual(idle.text);

  // the menu's overlay takes the mouse away: the plate stays as it was
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60);
  await page.waitForTimeout(300);
  const away = await readLink(page);
  expect({lit: away.lit, plates: away.plates}).toEqual({lit: true, plates: held.plates});

  // closed, it fades before it goes
  await page.evaluate(() => (window as any).releaseLinkPlate());
  expect((await readLink(page)).lit).toBe(false);
  await expect.poll(async() => (await readLink(page)).plates).toEqual([]);
  expect((await readLink(page)).plated).toBe(false);
});

test('a date in a message is a link: underlined under the mouse, lit while its menu is open', async({page}) => {
  await preparePopupSandbox(page, false);
  // a formatted date as a message's text renders it
  await page.evaluate(async() => {
    const {default: wrapRichText} = await window.e2eImport('/src/lib/richTextProcessor/wrapRichText.ts');
    const host = document.createElement('div');
    host.id = 'date-host';
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 400px; font: 16px sans-serif; z-index: 10000; background: #fff';
    host.append(wrapRichText('Meet at noon', {
      entities: [{_: 'messageEntityFormattedDate', offset: 8, length: 4, date: 1760000000, pFlags: {}}]
    }));
    document.body.append(host);
  });

  const date = page.locator('#date-host .formatted-date');
  await expect(date).toHaveText('noon');
  const box = await date.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => date.evaluate((element) => element.classList.contains('is-link-hovered'))).toBe(true);

  await holdPlate(date);
  expect(await date.evaluate((element) => element.querySelector('.link-plate')?.classList.contains('is-lit'))).toBe(true);
  await page.evaluate(() => (window as any).releaseLinkPlate());
  await expect.poll(() => date.evaluate((element) => !!element.querySelector('.link-plate'))).toBe(false);
});

test('a relative date keeps its lit plate as it ticks, and its text is still found past it', async({page}) => {
  await preparePopupSandbox(page, false);
  // "N seconds ago": it is rewritten every second
  await page.evaluate(async() => {
    const [{default: wrapRichText}, {getMiddleware}] = await Promise.all([
      window.e2eImport('/src/lib/richTextProcessor/wrapRichText.ts'),
      window.e2eImport('/src/helpers/middleware.ts')
    ]);
    const host = document.createElement('div');
    host.id = 'date-host';
    host.style.cssText = 'position: fixed; left: 100px; top: 100px; width: 400px; font: 16px sans-serif; z-index: 10000; background: #fff';
    host.append(wrapRichText('Sent now', {
      entities: [{_: 'messageEntityFormattedDate', offset: 5, length: 3, date: Math.floor(Date.now() / 1000) - 5, pFlags: {relative: true}}],
      middleware: getMiddleware().get()
    }));
    document.body.append(host);
  });

  const date = page.locator('#date-host .formatted-date');
  await holdPlate(date);
  const before = await date.textContent();
  await expect.poll(() => date.textContent(), {timeout: 5000}).not.toBe(before);
  // the tick rewrote the text, not the date: the plate is there and lit
  expect(await date.evaluate((element) => element.querySelector('.link-plate')?.classList.contains('is-lit'))).toBe(true);
  // what reads the date's text (the Quote item's check of a selection) finds it past the plate
  expect(await date.evaluate(async(element) => {
    const {getLinkFirstChild} = await window.e2eImport('/src/helpers/dom/linkPress.ts');
    const first = getLinkFirstChild(element);
    return first.nodeType === Node.TEXT_NODE && first.textContent === element.textContent;
  })).toBe(true);
  await page.evaluate(() => (window as any).releaseLinkPlate());
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

  await installPlateProbe(page);
  const read = () => page.evaluate(() => (window as any).plateOverLines(document.getElementById('long-link')));

  const last = await page.evaluate(() => {
    const rects = [...document.getElementById('long-link').getClientRects()];
    const rect = rects[rects.length - 1];
    return {x: rect.left + 4, y: rect.top + rect.height / 2};
  });
  await page.mouse.move(last.x, last.y);
  await page.mouse.down();
  const held = await read();
  expect(held.lines).toBeGreaterThan(2);
  expect(held.plate).toEqual(held.around);
  expect(held.cuts).toBe(held.lines);
  await page.mouse.up();
});

test('without animations the held link\'s plate is simply filled', async({page}) => {
  const link = await openLinkStory(page);
  const idle = await readLink(page);
  await page.evaluate(() => {
    (window as any).liteMode.isAvailable = () => false;
    // and the body's classes tell the stylesheet (the sandbox runs no `appImManager` to put them on)
    document.body.classList.remove('animation-level-1', 'animation-level-2');
    document.body.classList.add('animation-level-0');
  });
  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = await readLink(page);
  expect(held.pressed).toBe(true);
  expect(held.waves).toBe(0);
  expect(held.tint.opacity).toBe(1);
  expect(held.over.plate).toEqual(held.over.around);
  expect(held.background).toBe(idle.background);
  await page.mouse.up();
  // gone at once: there is no fade to wait for
  expect((await readLink(page)).plates).toEqual([]);
});

test('a held link keeps its ripple wherever the pointer goes, until it is let go', async({page}) => {
  const link = await openLinkStory(page);
  const box = await link.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  await expect.poll(async() => (await readLink(page)).waves).toBe(1);
  const held = await readLink(page);

  // along the link (a selection made from it), then off it onto the text before it — and well past
  // the wave's own life: the hover is gone, the wave stays
  await page.mouse.move(box.x + 28, y, {steps: 4});
  await page.mouse.move(box.x - 40, y, {steps: 4});
  await page.waitForTimeout(1000);
  const moved = await readLink(page);
  expect({waves: moved.waves, lit: moved.lit}).toEqual({waves: 1, lit: false});
  expect(moved.plates).toEqual(held.plates);

  await page.mouse.up();
  await expect.poll(async() => {
    const {plated, plates} = await readLink(page);
    return {plated, plates};
  }).toEqual({plated: false, plates: []});
});

test('a context menu over a held link lets it go', async({page}) => {
  const link = await openLinkStory(page);
  const box = await link.boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async() => (await readLink(page)).waves).toBe(1);
  // a Ctrl+click on macOS: the menu takes the pointer, and no pointerup need follow
  await link.evaluate((a) => a.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true})));
  await expect.poll(async() => (await readLink(page)).waves).toBe(0);
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
  await fontsLoaded(page);
  await installPlateProbe(page);
  // WebKit has no clip margin: there the plate stops at the line's edge
  const clipMargin = await page.evaluate(() => CSS.supports('overflow-clip-margin', '2px'));

  for(const id of ['bubble-name', 'ranked-name']) {
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const held = await page.evaluate((id) => {
      const link = document.getElementById(id);
      return {
        over: (window as any).plateOverLines(link, getComputedStyle(link).display === 'inline'),
        lineLeft: Math.round(link.closest('.name').getBoundingClientRect().left)
      };
    }, id);
    expect(held.over, id).toBeTruthy();
    if(clipMargin) {
      expect(held.over.plate, id).toEqual(held.over.around);
    } else {
      expect(held.over.plate[0], id).toBe(held.lineLeft);
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
  await page.waitForTimeout(100);
  // neither the hover nor the press gives it a plate
  expect(await anchor.evaluate((a) => a.className)).not.toContain('has-link-plate');
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

  await installPlateProbe(page);
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
        plated: element.classList.contains('has-link-plate'),
        over: (window as any).plateOverLines(element, style.display === 'inline'),
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
    expect(held[id].plated, id).toBe(true);
    expect(held[id].over?.plate, id).toEqual(held[id].over?.around);
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
    await expect.poll(takeLog).toEqual(expect.arrayContaining([expect.stringContaining('has-link-plate')]));

    // the tap's wave gone, and the plate with it: a finger hovers over nothing
    await expect.poll(() => link.evaluate((a) => a.className)).not.toContain('has-link-plate');
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
    await expect.poll(() => link.evaluate((a) => a.className)).toContain('has-link-plate');
    await page.waitForTimeout(800);
    expect(await link.evaluate((a) => a.querySelectorAll('.link-plate .c-ripple__circle:not(.hiding)').length)).toBe(1);
    await touch('touchEnd');
    await expect.poll(() => link.evaluate((a) => a.className)).not.toContain('has-link-plate');
  });
});
