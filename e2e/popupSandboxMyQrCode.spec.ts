import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * The QR screen: a compact panel on a desktop, the whole screen on a phone. It stands where a popup does, so that what
 * it opens — the fee's menu, the share picker, a toast — stands over it.
 * SHOTS_DIR (optional) takes a screenshot of each state, for looking at.
 */

const SHOTS = process.env.QR_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if(SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`});
}

/** Whether what stands at the middle of the element `selector` finds last is that element's own */
function isOnTop(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const element = [...document.querySelectorAll<HTMLElement>(selector)].pop();
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !!top && element.contains(top);
  }, selector);
}

for(const direction of ['ltr', 'rtl'] as const) {
  for(const [name, width] of [['desktop', 1280], ['narrow', 390]] as const) {
    test(`QR screen ${name} ${direction}`, async({page}) => {
      await page.setViewportSize({width, height: 800});
      await preparePopupSandbox(page, false);
      await page.evaluate((dir) => window.popupSandbox.setDirection(dir), direction);
      expect(await openStory(page, 'myQrCodeFee')).toBeNull();
      await page.waitForSelector('.popup.active');
      await page.waitForTimeout(700);
      await shot(page, `${name}-${direction}-closed`);

      const buttons = page.locator('.popup button[aria-controls="qr-sheet"]');
      for(const [index, panel] of ['colors', 'emoji'].entries()) {
        await buttons.nth(index).click();
        await page.waitForTimeout(900);
        await shot(page, `${name}-${direction}-${panel}`);
        // the pill steps aside for the panel, which has the room
        await expect(page.locator('.popup button:has-text("fee")')).toBeHidden();
        // the island has grown into the sheet: it comes back once the panel is put away
        await page.keyboard.press('Escape');
        await expect(buttons.nth(index)).toBeVisible();
      }
    });
  }
}

for(const direction of ['ltr', 'rtl'] as const) test(`The fee pill says its price with the app's star, smaller than its words and apart from the number (${direction})`, async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  await page.evaluate((dir) => window.popupSandbox.setDirection(dir), direction);
  expect(await openStory(page, 'myQrCodeFee')).toBeNull();
  const pill = page.locator('.popup button:has-text("fee")');
  await expect(pill).toBeVisible();
  const look = await pill.evaluate((button) => {
    const star = button.querySelector('.tgico');
    const textBox = (match: RegExp) => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) if(match.test(walker.currentNode.textContent)) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        return range.getBoundingClientRect();
      }
    };
    const starBox = star.getBoundingClientRect(), digitsBox = textBox(/\d/), wordsBox = textBox(/[a-z]/i);
    const middle = (box: DOMRect) => (box.top + box.bottom) / 2;
    return {
      text: button.textContent.includes('★'),
      size: parseFloat(getComputedStyle(button).fontSize),
      star: parseFloat(getComputedStyle(star).fontSize),
      // the star before the number in either direction, as an amount is written
      gap: digitsBox.left - starBox.right,
      // the number on the words' line, and the star on the number's middle
      raised: Math.abs(digitsBox.bottom - wordsBox.bottom),
      off: Math.abs(middle(starBox) - middle(digitsBox))
    };
  });
  expect(look.text).toBe(false);
  expect(look.size).toBeLessThanOrEqual(14);
  expect(look.star).toBeLessThan(look.size);
  expect(look.gap).toBeGreaterThanOrEqual(1.5);
  expect(look.raised).toBeLessThan(0.25);
  expect(look.off).toBeLessThan(1);
});

test('The fee menu stands over the QR screen', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeFee')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.waitForTimeout(600);

  // the fee taken off, the pill opens the menu that resets the code or brings the fee back
  await page.locator('.popup button:has-text("fee")').click();
  // the toast that says so takes the next click anywhere for itself: it is waited out
  await expect(page.locator('.toast.is-visible')).toHaveCount(0);
  // on the minute, the fill burns with sparks flying off it
  const sparks = page.locator('.popup [class*="_sparks_"]');
  await expect.poll(() => sparks.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for(let i = 3; i < data.length; i += 4) if(data[i]) ++lit;
    return lit;
  })).toBeGreaterThan(0);

  const free = page.locator('.popup button:has-text("Free")');
  await free.click();
  await page.locator('.btn-menu.active').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'desktop-fee-menu');
  expect(await isOnTop(page, '.btn-menu.active')).toBe(true);
  // over the pill, in its middle
  const [menuBox, pillBox] = await Promise.all([page.locator('.btn-menu.active').boundingBox(), free.boundingBox()]);
  expect(Math.abs(menuBox.x + menuBox.width / 2 - (pillBox.x + pillBox.width / 2))).toBeLessThan(1);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(pillBox.y);
});

test('The free pill\'s sparks rest while a panel hides it, and go when the motion is switched off', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeFee')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.waitForTimeout(600);
  await page.locator('.popup button:has-text("fee")').click();
  const sparks = page.locator('.popup [class*="_sparks_"]');
  // what the canvas holds: a sum over its pixels
  const picture = () => sparks.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for(let i = 3; i < data.length; i += 4) sum = (sum * 31 + data[i]) % 1e9;
    return sum;
  });
  await expect.poll(picture).toBeGreaterThan(0);

  // a panel open: the pill is out of sight, and nothing more is drawn (the toast of the fee's going is waited out: it
  // takes the next click anywhere for itself)
  await expect(page.locator('.toast.is-visible')).toHaveCount(0);
  await page.locator('.popup button[aria-controls="qr-sheet"]').first().click();
  await expect(page.locator('#qr-sheet [data-panel="colors"]')).toBeVisible();
  await page.waitForTimeout(300);
  const hidden = await picture();
  await page.waitForTimeout(400);
  expect(await picture()).toBe(hidden);
  await page.keyboard.press('Escape');
  await expect.poll(async() => (await picture()) !== hidden).toBe(true);

  // the reduced level on the way: no sparks, and the fill is the straight one of the stylesheet again
  await page.evaluate(async() => {
    const {default: liteMode} = await window.e2eImport('/src/helpers/liteMode.ts');
    liteMode.setAnimationLevel(1);
  });
  await expect(sparks).toHaveCount(0);
  const fill = page.locator('.popup [class*="_fill_"]');
  expect(await fill.evaluate((element: HTMLElement) => element.style.clipPath)).toBe('');

  // and back on in the minute's middle, the fill stands where the time has got to, not full again
  await page.waitForTimeout(2000);
  await page.evaluate(async() => {
    const {default: liteMode} = await window.e2eImport('/src/helpers/liteMode.ts');
    liteMode.setAnimationLevel(2);
  });
  await expect(sparks).toHaveCount(1);
  await page.waitForTimeout(700);
  const {front, width, left} = await fill.evaluate((element: HTMLElement) => {
    const xs = [...element.style.clipPath.matchAll(/(-?[\d.]+)px -?[\d.]+px/g)].map((match) => +match[1]);
    const text = element.parentElement.textContent;
    return {front: Math.max(...xs), width: element.offsetWidth, left: +text.match(/0:(\d\d)/)[1]};
  });
  expect(left).toBeLessThan(56);
  expect(front).toBeLessThan((width + 10) * (left + 1) / 60 + 1);
});

test('The screen opens where it stands, the controls growing in', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  // what the popup's container, the card and the close button stand at, frame by frame from the first one it shows
  type Sample = {still: boolean, card: number, close: number, top: number, width: number, height: number};
  const frames = page.evaluate(() => new Promise<Sample[]>((resolve) => {
    const frames: Sample[] = [];
    let start: number;
    const scaleOf = (element: Element) => new DOMMatrix(getComputedStyle(element).transform).a;
    const step = (now: number) => {
      const container = document.querySelector('.popup.active .popup-container');
      const card = container?.querySelector('[class*="_card_"]'), close = container?.querySelector('.popup-close');
      if(card && close) {
        start ??= now;
        const box = card.getBoundingClientRect(), top = box.top - container.getBoundingClientRect().top;
        frames.push({still: new DOMMatrix(getComputedStyle(container).transform).isIdentity, card: scaleOf(card), close: scaleOf(close), top, width: box.width, height: box.height});
      }

      if(start === undefined || now - start < 1200) requestAnimationFrame(step);
      else resolve(frames);
    };
    requestAnimationFrame(step);
  }));
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  const sampled = await frames;
  // the code does not fly in: nothing it stands on moves, and the card stands where it ends, at its size, from the
  // first frame
  const last = sampled[sampled.length - 1];
  expect(sampled.every((frame) => frame.still && frame.card === 1)).toBe(true);
  expect(sampled.every((frame) => Math.abs(frame.top - last.top) < 0.5)).toBe(true);
  expect(sampled.every((frame) => Math.abs(frame.width - last.width) < 0.5 && Math.abs(frame.height - last.height) < 0.5)).toBe(true);
  expect(sampled[0].close).toBeLessThan(0.9);
  expect(last.close).toBeCloseTo(1, 2);
});

test('The code builds itself once the screen has faded in, not under the fade', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  // the popup's opacity and how much of the code's canvas is inked, frame by frame from the open
  const frames = page.evaluate(() => new Promise<{opacity: number, inked: number}[]>((resolve) => {
    const frames: {opacity: number, inked: number}[] = [];
    const probe = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
    probe.canvas.width = probe.canvas.height = 48;
    let start: number;
    const step = (now: number) => {
      const popup = document.querySelector<HTMLElement>('.popup.active');
      const canvas = [...popup?.querySelectorAll<HTMLCanvasElement>('[class*="_qr_"] canvas') ?? []].pop();
      if(popup) {
        start ??= now;
        let inked = 0;
        if(canvas?.width) {
          probe.clearRect(0, 0, 48, 48);
          probe.drawImage(canvas, 0, 0, 48, 48);
          const data = probe.getImageData(0, 0, 48, 48).data;
          for(let i = 3; i < data.length; i += 4) if(data[i] > 128) ++inked;
        }

        frames.push({opacity: +getComputedStyle(popup).opacity, inked});
      }

      if(start === undefined || now - start < 1500) requestAnimationFrame(step);
      else resolve(frames);
    };
    requestAnimationFrame(step);
  }));
  expect(await openStory(page, 'myQrCode')).toBeNull();
  const sampled = await frames;
  const whole = Math.max(...sampled.map((frame) => frame.inked));
  expect(whole).toBeGreaterThan(300);
  // the first frame the screen is in, the code has not begun yet: half of its build is in its first tenth
  const shown = sampled.find((frame) => frame.opacity > 0.99);
  expect(shown.inked).toBeLessThan(whole * 0.1);
  // and it builds after, frame by frame rather than at once
  const after = sampled.slice(sampled.indexOf(shown));
  expect(after.some((frame) => frame.inked > whole * 0.2 && frame.inked < whole * 0.9)).toBe(true);
});

test('A panel moves the card up over a transition, and a resize with it open puts the card in place at once', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCode')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.waitForTimeout(1000);
  // the card's top against the screen, frame by frame for a while
  const tops = (duration: number) => page.evaluate((duration) => new Promise<number[]>((resolve) => {
    const tops: number[] = [];
    const start = performance.now();
    const step = () => {
      const surface = document.querySelector('.popup.active [class*="_surface_"]');
      const card = surface.querySelector('[class*="_cardPlace_"]');
      tops.push(card.getBoundingClientRect().top - surface.getBoundingClientRect().top);
      if(performance.now() - start < duration) requestAnimationFrame(step);
      else resolve(tops);
    };
    requestAnimationFrame(step);
  }), duration);

  const opening = tops(600);
  await page.locator('.popup button[aria-controls="qr-sheet"]').first().click();
  const moved = await opening;
  // on its way up it passes through places between
  const from = moved[0], to = moved[moved.length - 1];
  expect(to).toBeLessThan(from);
  expect(moved.some((top) => top < from - 1 && top > to + 1)).toBe(true);

  const resized = tops(500);
  await page.setViewportSize({width: 1280, height: 640});
  const after = await resized;
  const end = after[after.length - 1];
  // no frame stands away from where it ends: the geometry's change is not a move
  expect(after.slice(after.findIndex((top) => Math.abs(top - after[0]) > 0.5) + 1).every((top) => Math.abs(top - end) < 0.5)).toBe(true);
});

test('The code builds itself into the very picture of the code', async({page}) => {
  await preparePopupSandbox(page, false);
  // the build's last frame before the code itself takes its place, against the code
  const off = await page.evaluate(async() => {
    const {default: createQrIntro} = await window.e2eImport('/src/components/popups/myQrCode/qrIntro.ts');
    const {default: renderQr} = await window.e2eImport('/src/components/popups/myQrCode/qr.ts');
    const rendered = await renderQr('https://t.me/somewhatusername', '#5468e0');
    const intro = createQrIntro(rendered.canvas, rendered.modules, 224, '#5468e0');
    const side = intro.canvas.width;
    const last = document.createElement('canvas');
    last.width = last.height = side;
    const lastContext = last.getContext('2d');
    await new Promise<void>((resolve) => {
      let done = false;
      intro.play(() => {
        done = true;
        resolve();
      });
      // after the build's own frame, which was asked for first
      const keep = () => {
        if(done) return;
        lastContext.clearRect(0, 0, side, side);
        lastContext.drawImage(intro.canvas, 0, 0);
        requestAnimationFrame(keep);
      };
      requestAnimationFrame(keep);
    });

    const code = document.createElement('canvas');
    code.width = code.height = side;
    code.getContext('2d').drawImage(rendered.canvas, 0, 0, side, side);
    const a = lastContext.getImageData(0, 0, side, side).data, b = code.getContext('2d').getImageData(0, 0, side, side).data;
    let count = 0;
    for(let i = 3; i < a.length; i += 4) {
      if(Math.abs(a[i] - b[i]) > 64) ++count;
    }

    return count;
  });
  // the finders' rings are rounder inside than their cells: none of them is cut square until the end
  expect(off).toBe(0);
});

test('The chosen emoji stand at the bottom of their panel, and a panel keeps its content as it shrinks back', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.locator('.popup button[aria-controls="qr-sheet"]').nth(1).click();
  const strip = page.locator('#qr-sheet [class*="_chosenStrip_"]');
  await expect(strip.locator('button')).toHaveCount(3);
  await page.waitForTimeout(600);
  await shot(page, 'desktop-emoji-strip');
  // inside the sheet, over the keyboard, near its bottom
  const [stripBox, sheetBox] = await Promise.all([strip.boundingBox(), page.locator('#qr-sheet').boundingBox()]);
  expect(stripBox.y + stripBox.height).toBeLessThan(sheetBox.y + sheetBox.height);
  expect(sheetBox.y + sheetBox.height - (stripBox.y + stripBox.height)).toBeLessThan(30);
  expect(await isOnTop(page, '#qr-sheet [class*="_chosenStrip_"]')).toBe(true);
  // each 26 px, as on Android
  const art = await strip.locator('[class*="_chosenEmojiArt_"]').first().boundingBox();
  expect([art.width, art.height]).toEqual([26, 26]);

  // put away, the sheet still shows its content while it shrinks into the island, and lets it go after
  const shownWhileClosing = await page.evaluate(() => new Promise<boolean>((resolve) => {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true}));
    requestAnimationFrame(() => {
      const content = document.querySelector<HTMLElement>('#qr-sheet [data-panel="emoji"]');
      resolve(!content.hidden && getComputedStyle(document.getElementById('qr-sheet')).visibility === 'visible');
    });
  }));
  expect(shownWhileClosing).toBe(true);
  await expect(page.locator('#qr-sheet [data-panel="emoji"]')).toBeHidden();
  await expect(page.locator('#qr-sheet')).toBeHidden();
});

test('An owner without gifts gets the empty sheet, with the way to the gift store', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeNoGifts')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.locator('.popup button[aria-controls="qr-sheet"]').nth(2).click();
  const browse = page.locator('.popup button:has-text("Browse Gifts")');
  await expect(browse).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'desktop-gifts-empty');
  // the sheet holds just the empty state (`QrShareView.EMPTY_H`), not the whole height
  const height = await page.locator('#qr-sheet').evaluate((sheet) => sheet.getBoundingClientRect().height);
  expect(Math.round(height)).toBe(286);
});

test('The share picker stands over the QR screen', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCode')).toBeNull();
  await page.locator('.popup button[aria-label="Share QR Code"]').waitFor();
  await page.waitForTimeout(600);

  await page.locator('.popup-container button[aria-label="Share QR Code"]').click();
  await expect(page.locator('.popup.active')).toHaveCount(2);
  await page.waitForTimeout(600);
  await shot(page, 'desktop-share-picker');
  expect(await isOnTop(page, '.popup.active .popup-container')).toBe(true);

  // a chat picked, the code goes to it as a photo with its link, as the other clients send it, not as a file
  await page.locator('.popup.active').last().locator('a.row').first().click();
  await expect.poll(() => page.evaluate(() => window.popupSandbox.calls()
  .filter(({manager, method}) => manager === 'appMessagesManager' && method === 'sendFile')
  .map(({args: [options]}: {args: any[]}) => ({isMedia: options.isMedia, type: options.file?.type, caption: options.caption})))).toEqual([{isMedia: true, type: 'image/png', caption: 'https://t.me/sandbox_me'}]);
});

test('A toast shows over the QR screen', async({page}) => {
  await preparePopupSandbox(page, false);
  // a toast made before the panel is opened: its container is older than the panel
  await page.evaluate(async() => {
    const {toastNew} = await window.e2eImport('/src/components/toast.ts');
    toastNew({langPackKey: 'QRCode.Saved'});
  });
  expect(await openStory(page, 'myQrCode')).toBeNull();
  await page.evaluate(async() => {
    const {toastNew} = await window.e2eImport('/src/components/toast.ts');
    toastNew({langPackKey: 'QRCode.Copied', duration: 10_000});
  });
  await page.waitForTimeout(500);
  expect(await isOnTop(page, '.toast')).toBe(true);
});

for(const width of [1280, 414]) test(`The emoji sheet: the dropdown's tabs in white, even gaps, a pick lit with its number over it (${width} px)`, async({page}) => {
  await page.setViewportSize({width, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.locator('.popup button[aria-controls="qr-sheet"]').nth(1).click();
  const host = page.locator('#qr-sheet [class*="_emojiHost_"]');
  // the tab on show: the dropdown's own round one, white on the glass rather than in the app's text colour
  const tab = host.locator('.menu-horizontal-div-item.active');
  await expect(tab).toHaveCSS('color', /^rgba?\(255, 255, 255/);
  await expect(tab).toHaveCSS('background-color', /^rgba\(255, 255, 255,/);
  const tabBox = await tab.boundingBox();
  expect(Math.abs(tabBox.width - tabBox.height)).toBeLessThan(0.5);
  // the spinner of packs on their way is white as the tabs, not in the app's blue
  expect(await host.evaluate((element) => {
    const preloader = document.createElement('div');
    preloader.className = 'preloader';
    preloader.innerHTML = '<svg class="preloader-circular" viewBox="25 25 50 50"><circle class="preloader-path" cx="50" cy="50" r="20" fill="none"/></svg>';
    element.querySelector('.emoticons-content').append(preloader);
    const stroke = getComputedStyle(preloader.querySelector('circle')).stroke;
    preloader.remove();
    return stroke;
  })).toBe('rgb(255, 255, 255)');

  // the emoji as far apart down as across, and each pack keeps the height of its rows when its emoji go out of sight
  const grid = await host.evaluate((element) => {
    const cells = [...element.querySelectorAll('.super-emoji')].map((cell) => cell.getBoundingClientRect());
    const below = cells.find((cell) => cell.top > cells[0].top + 1);
    const packs = [...element.querySelectorAll<HTMLElement>('.super-emojis')].map((pack) => {
      const rects = [...pack.querySelectorAll('.super-emoji')].map((cell) => cell.getBoundingClientRect());
      return Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)) - parseFloat(pack.style.minHeight);
    });
    return {across: cells[1].left - cells[0].left, down: below.top - cells[0].top, packs};
  });
  expect(grid.down).toBeCloseTo(grid.across, 1);
  expect(grid.packs.length).toBeGreaterThan(0);
  grid.packs.forEach((difference) => expect(Math.abs(difference)).toBeLessThan(1));

  // picked, a cell is numbered, the number over the emoji, which the tab draws over its cells; the emoji comes to the
  // strip with a canvas of its own size the whole time, so that it is never made anew, blank, as the strip widens
  const cell = host.locator('.super-emoji').first();
  // from the first frame its canvas is there, for the pop and a while after
  const rendererWidths = page.evaluate(() => new Promise<number[]>((resolve) => {
    const widths: number[] = [];
    let start: number;
    const step = (now: number) => {
      const renderers = document.querySelectorAll<HTMLElement>('#qr-sheet [class*="_chosenStrip_"] .custom-emoji-renderer');
      if(renderers.length) start ??= now;
      renderers.forEach((renderer) => widths.push(renderer.offsetWidth));
      if(start === undefined || now - start < 600) requestAnimationFrame(step);
      else resolve(widths);
    };
    requestAnimationFrame(step);
  }));
  await cell.click();
  await expect(cell).toHaveAttribute('data-pick', /\d/);
  const widths = await rendererWidths;
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths)).toBeLessThanOrEqual(26);

  const look = () => cell.evaluate((element) => {
    // the opacity of a translucent colour: its last number
    const alpha = (color: string) => +color.match(/([\d.]+)\)$/)[1];
    const renderer = element.closest('.emoticons-container').querySelector('.custom-emoji-renderer');
    return {
      lit: alpha(getComputedStyle(element).backgroundColor),
      over: +getComputedStyle(element, '::after').zIndex > +getComputedStyle(renderer).zIndex
    };
  });
  await page.mouse.move(0, 0);
  const rest = await look();
  expect(rest.over).toBe(true);
  expect(rest.lit).toBeCloseTo(0.18, 2);
  // hovered, it stays lit, a little more, rather than taking the app's grey
  await cell.hover();
  expect((await look()).lit).toBeGreaterThan(rest.lit);
});

test('The colours and the gifts scroll in the app\'s own scroller, as the emoji do', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCode')).toBeNull();
  await page.waitForSelector('.popup.active');
  // the room its scrollbar takes beside the content: none for the app's, which draws a thumb of its own or overlays it
  const gutters: Record<string, number> = {};
  for(const [index, panel] of ['colors', 'emoji', 'gifts'].entries()) {
    await page.locator('.popup button[aria-controls="qr-sheet"]').nth(index).click();
    const scroller = page.locator(`#qr-sheet [data-panel="${panel}"] .scrollable-y`).first();
    await expect(scroller).toBeVisible();
    gutters[panel] = await scroller.evaluate((element: HTMLElement) => element.offsetWidth - element.clientWidth);
    // put away: the island is back for the next
    await page.keyboard.press('Escape');
    await expect(page.locator('#qr-sheet')).toBeHidden();
  }

  expect(gutters.colors).toBe(gutters.emoji);
  expect(gutters.gifts).toBe(gutters.emoji);
});

/** The emoji pattern's screen, its emoji popped in; and how many of a sample of the field's pixels differ from the last call's */
async function openPattern(page: Page) {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  await page.waitForSelector('.popup.active');
  await page.waitForTimeout(1500);
  const surface = await page.locator('.popup.active [class*="_surface_"]').boundingBox();
  const changed = () => page.evaluate(() => {
    const canvas = [...document.querySelectorAll<HTMLCanvasElement>('.popup.active [class*="_fieldMover_"] canvas')].pop();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const last = (window as any).__qrField as Uint8ClampedArray;
    (window as any).__qrField = data;
    let differ = 0;
    if(last) for(let i = 3; i < data.length; i += 28) if(Math.abs(data[i] - last[i]) > 40) ++differ;
    return differ;
  });
  return {surface, changed};
}

test('The pattern follows a drag flung off the screen at once, and a release out there leaves the screen open', async({page}) => {
  const {surface, changed} = await openPattern(page);

  // pressed on the backdrop under the card, the pointer leaves the screen with its first move
  const y = surface.y + surface.height * 0.8;
  await page.mouse.move(surface.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(surface.x - 60, y);
  // the drift stands still under a press
  await page.waitForTimeout(400);
  await changed();
  await page.waitForTimeout(100);
  expect(await changed()).toBe(0);
  // moved on out there, the pattern goes with it
  await page.mouse.move(surface.x - 120, y - 100);
  await page.waitForTimeout(150);
  expect(await changed()).toBeGreaterThan(1000);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.locator('.popup.active')).toHaveCount(1);

  // a press whose release the window never hears (it lost the focus) is over: the pointer moving on drags nothing
  await page.waitForTimeout(2500);
  await page.mouse.move(surface.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(surface.x + 80, y);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);
  await changed();
  await page.mouse.move(surface.x + 180, y - 80);
  await page.waitForTimeout(150);
  expect(await changed()).toBeLessThan(1000);
  await page.mouse.up();
});

test('A fling glides on after the release, however late its events are handled', async({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'the moves are timed through CDP');
  const {surface, changed} = await openPattern(page);
  await page.waitForTimeout(2500);
  await changed();
  await page.waitForTimeout(300);
  // what the drift alone changes at rest
  const resting = await changed();

  // a press, moves 16 ms apart and a release on the way, in the events' own times, whenever the page handles them
  const cdp = await page.context().newCDPSession(page);
  const epoch = await page.evaluate(() => (performance.timeOrigin + performance.now()) / 1000);
  const y = surface.y + surface.height * 0.8;
  const send = (type: string, dx: number, buttons: number, at: number) => cdp.send('Input.dispatchMouseEvent', {
    type: type as 'mouseMoved', x: surface.x + 40 + dx, y: y - dx / 10, button: 'left', buttons, clickCount: 1, timestamp: epoch + at
  });
  // a busy page: every handler late
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 6});
  await send('mouseMoved', 0, 0, 0);
  await send('mousePressed', 0, 1, 0.016);
  const steps = [10, 25, 45, 70, 100, 135, 175];
  for(const [index, dx] of steps.entries()) await send('mouseMoved', dx, 1, 0.032 + index * 0.016);
  await send('mouseReleased', 220, 0, 0.032 + steps.length * 0.016);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  await page.waitForTimeout(50);
  await changed();
  await page.waitForTimeout(300);
  // it glides on: far more of it changes than the drift changes
  expect(await changed()).toBeGreaterThan(Math.max(1000, resting * 4));
});

test('A video emoji plays in the pattern, though its player stands out of sight', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  await page.waitForSelector('.popup.active');
  const playing = await page.evaluate(async() => {
    // the emoji's clip, recorded here: a colour going round
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const paint = canvas.getContext('2d');
    const recorder = new MediaRecorder(canvas.captureStream(30), {mimeType: 'video/webm;codecs=vp9'});
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    let hue = 0;
    const timer = setInterval(() => {
      paint.fillStyle = `hsl(${hue = (hue + 20) % 360} 80% 50%)`;
      paint.fillRect(0, 0, 64, 64);
    }, 33);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    recorder.stop();
    await new Promise((resolve) => recorder.onstop = resolve);
    clearInterval(timer);
    const url = URL.createObjectURL(new Blob(chunks, {type: 'video/webm'}));
    const doc = {
      _: 'document', id: '5550001', access_hash: '0', file_reference: [] as number[], date: 0, mime_type: 'video/webm', size: 1,
      dc_id: 1, pFlags: {}, sticker: 3, animated: true, w: 100, h: 100, thumbs: [] as any[],
      attributes: [
        {_: 'documentAttributeCustomEmoji', pFlags: {}, alt: '🔥', stickerset: {_: 'inputStickerSetEmpty'}},
        {_: 'documentAttributeVideo', pFlags: {}, w: 100, h: 100, duration: 1}
      ]
    };

    // downloaded already, and the theme's only emoji
    const {default: apiManagerProxy} = await window.e2eImport('/src/lib/apiManagerProxy.ts');
    const {default: getThumbKey} = await window.e2eImport('/src/lib/storages/utils/thumbs/getThumbKey.ts');
    const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
    const {default: rootScope} = await window.e2eImport('/src/lib/rootScope.ts');
    apiManagerProxy.mirrors.thumbs[getThumbKey(doc as any)] = {'': {downloaded: 1, url, type: ''}};
    getMockManagers().override({
      appProfileManager: {getCachedShareTheme: () => ({_: 'shareThemeEmojiBackdrop', backdrop_id: 4, emojis: [{_: 'reactionCustomEmoji', document_id: doc.id}]})},
      appEmojiManager: {getCustomEmojiDocument: () => doc}
    });
    window.popupSandbox.closePopups();
    const {default: showMyQrCodePopup} = await window.e2eImport('/src/components/popups/myQrCode.tsx');
    await showMyQrCodePopup(rootScope.myId);

    let video: HTMLVideoElement;
    for(let i = 0; i < 50 && !video?.readyState; ++i) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      video = [...document.querySelectorAll('video')].find((element) => !element.closest('.popup'));
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const from = video.currentTime;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {outOfSight: video.getBoundingClientRect().bottom < 0, paused: video.paused, moved: video.currentTime !== from};
  });

  expect(playing).toEqual({outOfSight: true, paused: false, moved: true});
});

test('The theme\'s own gift comes with the first page of the others, not alone before them', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCode')).toBeNull();
  const counts = await page.evaluate(async() => {
    const {default: rootScope} = await window.e2eImport('/src/lib/rootScope.ts');
    const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
    // five gifts of the owner's on a page that takes its time, and a theme of a sixth the page does not hold
    const {gifts: [base]} = await rootScope.managers.appGiftsManager.getProfileGifts({peerId: rootScope.myId});
    const copy = (n: number) => ({...base, raw: {...base.raw, id: String(9000 + n), slug: 'gift-' + n, num: n}, input: {...base.input, msg_id: 9000 + n}});
    const gifts = [1, 2, 3, 4, 5].map(copy);
    getMockManagers().override({
      appProfileManager: {getCachedShareTheme: () => ({_: 'shareThemeGift', stargift: copy(42).raw, theme_settings: [] as any[]})},
      appGiftsManager: {
        wrapGift: (gift: any) => ({...base, raw: gift}),
        getProfileGifts: () => new Promise((resolve) => setTimeout(() => resolve({next: undefined as string, gifts, count: gifts.length, collections: [] as any[]}), 800))
      }
    });
    window.popupSandbox.closePopups();
    const {default: showMyQrCodePopup} = await window.e2eImport('/src/components/popups/myQrCode.tsx');
    await showMyQrCodePopup(rootScope.myId);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    document.querySelectorAll<HTMLElement>('.popup button[aria-controls="qr-sheet"]')[2].click();
    const counts: number[] = [];
    for(let i = 0; i < 30; ++i) {
      counts.push(document.querySelectorAll('.popup.active [class*="_giftTile_"]').length);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return counts;
  });

  expect(counts[counts.length - 1]).toBe(6);
  expect(counts.every((count) => count === 0 || count === 6)).toBe(true);
});

test('A picture saved before the emoji\'s pictures came is not kept for the saves after', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  // the pattern's emoji pictures come late
  let release: () => void;
  const arrived = new Promise<void>((resolve) => release = resolve);
  await page.route('**/assets/img/emoji/**', async(route) => {
    await arrived;
    await route.continue();
  });
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  await page.locator('.popup.active [class*="_fieldMover_"] canvas').first().waitFor();
  const save = async() => {
    const download = page.waitForEvent('download');
    await page.locator('.popup.active button[aria-label="Save"]').click();
    return (await download).createReadStream().then(async(stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    });
  };

  const early = await save();
  release();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('body > div[aria-hidden="true"] img')].every((image) => image.naturalWidth))).toBe(true);
  // the toast of the first save is waited out: it takes the next click for itself
  await expect(page.locator('.toast.is-visible')).toHaveCount(0);
  const late = await save();
  expect(late.equals(early)).toBe(false);
});

test('The motion switched off while the screen opens leaves the pattern drawn', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'myQrCodeEmoji')).toBeNull();
  // the reduced level comes while the controls still grow in, the emoji waiting to pop in
  await page.evaluate(async() => {
    const {default: liteMode} = await window.e2eImport('/src/helpers/liteMode.ts');
    liteMode.setAnimationLevel(1);
  });
  await page.waitForTimeout(2000);
  const inked = await page.locator('.popup.active [class*="_fieldMover_"] canvas').last().evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for(let i = 3; i < data.length; i += 4 * 16) if(data[i] > 128) ++lit;
    return lit;
  });
  expect(inked).toBeGreaterThan(500);
});

test('The code builds on the frames of the window it stands in, while the tab\'s own do not come', async({page}) => {
  await preparePopupSandbox(page, false);
  // a screen moved into another window (Document PiP), the tab behind it in the background: its frames stop
  const built = await page.evaluate(async() => {
    const {default: createQrIntro} = await window.e2eImport('/src/components/popups/myQrCode/qrIntro.ts');
    const {default: renderQr} = await window.e2eImport('/src/components/popups/myQrCode/qr.ts');
    const rendered = await renderQr('https://t.me/somewhatusername', '#5468e0');
    const other = document.createElement('iframe');
    document.body.append(other);
    const intro = createQrIntro(rendered.canvas, rendered.modules, 224, '#5468e0');
    other.contentDocument.body.append(intro.canvas);
    const tabFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      return await new Promise<boolean>((resolve) => {
        intro.play(() => resolve(true));
        setTimeout(() => resolve(false), 3000);
      });
    } finally {
      window.requestAnimationFrame = tabFrame;
      other.remove();
    }
  });
  expect(built).toBe(true);
});
