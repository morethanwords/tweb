import {expect, type Page} from '@playwright/test';
import {PNG} from 'pngjs';
import {test} from './workerContext';
import {openStory, popupSettled, preparePopupSandbox} from './popupSandbox.helpers';

const POPUP = '.popup-wallet-profile-card';
const SOURCE = '[data-wallet-profile-card-source]';
const CARD = '[data-wallet-profile-card]';

async function expectPaintedCard(page: Page) {
  const {data, width, height} = PNG.sync.read(await page.locator(CARD).screenshot());
  let blue = 0;
  for(let i = 0; i < data.length; i += 4) {
    if(data[i + 2] > data[i] + 60 && data[i + 1] > data[i] + 30) ++blue;
  }
  // Text and a correctly sized transparent canvas do not constitute a card.
  expect(blue / (width * height)).toBeGreaterThan(.5);
}

async function openCard(page: Page) {
  expect(await openStory(page, 'wallet/profileCard')).toBeNull();
  await expect(page.locator(POPUP)).toBeVisible();
  await expect(page.locator(CARD)).toBeVisible();
}

test('the profile card passes Axe', async({page}) => {
  const {expectNoA11yViolations} = await import('./accessibility.helpers');
  await openCard(page);
  await popupSettled(page, POPUP);
  await expectNoA11yViolations(page, POPUP);
});

test('Tab reaches the action without a close button and Escape restores focus', async({page}) => {
  await openCard(page);
  await popupSettled(page, POPUP);
  await expect(page.locator(POPUP).getByRole('button', {name: 'Close', exact: true})).toHaveCount(0);
  const action = page.locator(POPUP).getByRole('button', {name: 'Send money', exact: true});
  let reachedAction = false;
  for(let step = 0; step < 12; ++step) {
    await page.keyboard.press('Tab');
    expect(await page.locator(POPUP).evaluate((popup) => popup.contains(document.activeElement))).toBe(true);
    if(await action.evaluate((button) => button === document.activeElement)) {
      reachedAction = true;
      break;
    }
  }
  expect(reachedAction).toBe(true);
  expect((await action.boundingBox()).height).toBe(44);
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(SOURCE)).toBeFocused();
});

test('closing after the source disappears removes the popup and releases focus', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openCard(page);
  await popupSettled(page, POPUP);
  await page.locator(SOURCE).evaluate((source) => source.remove());
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.isConnected)).toBe(true);
  expect(errors).toEqual([]);
});

test('a card waiting for its fonts does not open after its source disappears', async({page}) => {
  await page.evaluate(() => {
    const load = document.fonts.load.bind(document.fonts);
    let release: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    (window as any).releaseWalletFonts = release;
    document.fonts.load = async(...args) => {
      if(args[0].includes('Roboto Mono')) await pending;
      return load(...args);
    };
  });
  expect(await openStory(page, 'wallet/profileCard')).toBeNull();
  await expect(page.locator(POPUP)).toHaveCount(1);
  await expect(page.locator(`${POPUP}.active`)).toHaveCount(0);
  await page.locator(SOURCE).evaluate((source) => source.remove());
  await page.evaluate(() => (window as any).releaseWalletFonts());
  await expect(page.locator(POPUP)).toHaveCount(0);
});

test('the full opening flight does not lay out on every frame', async({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'LayoutCount is a Chromium CDP metric');
  await openCard(page);
  await popupSettled(page, POPUP);
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Performance.enable');
    await page.locator(SOURCE).evaluate((source: HTMLElement) => source.click());
    await page.waitForFunction((selector) => {
      const card = document.querySelector(selector);
      return card?.getAnimations().some((animation) =>
        animation.playState === 'running' && Number(animation.currentTime) >= 32
      );
    }, CARD);
    expect(await page.locator(CARD).evaluate((card) =>
      card.getAnimations()[0]?.effect.getTiming().duration
    )).toBe(300);
    expect(await page.locator(POPUP).evaluate((popup) =>
      getComputedStyle(popup).getPropertyValue('--popup-transition-time').trim()
    )).toBe('180ms');
    const before = (await cdp.send('Performance.getMetrics')).metrics.find(({name}) => name === 'LayoutCount').value;
    await popupSettled(page, POPUP);
    const after = (await cdp.send('Performance.getMetrics')).metrics.find(({name}) => name === 'LayoutCount').value;
    // Initial sizing may finish, but the transform flight must not lay out each frame.
    expect(after - before).toBeLessThanOrEqual(6);
    expect(await page.locator(CARD).evaluate((card) => ({
      animations: card.getAnimations().length,
      willChange: (card as HTMLElement).style.willChange
    }))).toEqual({animations: 0, willChange: ''});
  } finally {
    await cdp.detach();
  }
});

test.beforeEach(async({page}) => {
  await preparePopupSandbox(page, false, {a11y: true});
});

for(const direction of ['ltr', 'rtl'] as const) {
  test(`the ${direction} flight is visible at the source and does not skip its path`, async({page}) => {
    await page.evaluate((direction) => window.popupSandbox.setDirection(direction), direction);
    await openCard(page);
    const samples = await page.locator(CARD).evaluate((card) => {
      const animation = card.getAnimations()[0];
      animation.pause();
      const duration = Number(animation.effect.getTiming().duration);
      const samples = [0, .25, 1].map((progress) => {
        animation.currentTime = duration * progress;
        const rect = card.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, opacity: getComputedStyle(card).opacity};
      });
      animation.currentTime = 0;
      animation.play();
      const source = document.querySelector('[data-wallet-profile-card-source]').getBoundingClientRect();
      return {samples, source: {x: source.x + source.width / 2, y: source.y + source.height / 2}};
    });
    const [start, quarter, end] = samples.samples;
    expect(start.x).toBeCloseTo(samples.source.x, 0);
    expect(start.y).toBeCloseTo(samples.source.y, 0);
    expect(start.opacity).toBe('1');
    const distance = (point: typeof start) => Math.hypot(point.x - end.x, point.y - end.y);
    expect(distance(quarter) / distance(start)).toBeGreaterThan(.5);
    await popupSettled(page, POPUP);
  });
}

test('the backdrop, caption and action fade together on opening and closing', async({page}) => {
  await openCard(page);
  await popupSettled(page, POPUP);
  const viewport = page.viewportSize();
  expect(await page.locator('[data-wallet-profile-card-backdrop]').boundingBox()).toEqual({x: 0, y: 0, ...viewport});
  expect(await page.locator('[data-wallet-profile-card-backdrop]').evaluate((backdrop) =>
    !!backdrop.closest('.popup-wallet-profile-card') && !backdrop.closest('.popup-container')
  )).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  await page.locator(SOURCE).evaluate((source: HTMLElement) => source.click());

  for(const closing of [false, true]) {
    if(closing) await page.keyboard.press('Escape');
    await page.waitForFunction(({selector, closing}) => {
      const popup = document.querySelector(selector);
      if(!popup || popup.classList.contains('hiding') !== closing) return false;
      const card = popup.querySelector('[data-wallet-profile-card]');
      const caption = card?.parentElement.previousElementSibling;
      const button = popup.querySelector('[role="dialog"] button');
      const targets = [popup.querySelector('[data-wallet-profile-card-backdrop]'), caption, button];
      const fades = popup.getAnimations({subtree: true}).filter((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return targets.includes(effect.target as Element) && effect.getKeyframes().some((frame) => frame.opacity !== undefined);
      });
      if(fades.length !== 3) return false;
      for(const animation of fades) {
        animation.pause();
        animation.currentTime = 90;
      }
      return targets.every((target) => {
        const opacity = Number(getComputedStyle(target).opacity);
        return opacity > 0 && opacity < 1;
      });
    }, {selector: POPUP, closing});
    expect(await page.locator(POPUP).evaluate((popup) => getComputedStyle(popup).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await page.locator(POPUP).evaluate((popup) => popup.getAnimations({subtree: true}).forEach((animation) => animation.play()));
    if(!closing) await popupSettled(page, POPUP);
  }
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(SOURCE)).toBeFocused();
});

for(const currency of ['USD', 'EUR']) {
  test(`shows the balance in ${currency} and the shared card address`, async({page}) => {
    await page.evaluate((currency) => localStorage.setItem('wallet_fiat_currency', currency), currency);
    try {
      await openCard(page);
      await expect(page.locator(CARD)).toContainText(currency === 'EUR' ? '€' : '$');
      const addressColor = await page.locator(CARD).locator('[dir="ltr"]').last().evaluate((address) => getComputedStyle(address).color);
      expect(addressColor).toBe('rgba(0, 0, 0, 0.14)');
    } finally {
      await page.evaluate(() => localStorage.removeItem('wallet_fiat_currency'));
    }
  });
}

test('blurs the background, closes with Escape and restores the balance button', async({page}) => {
  await openCard(page);
  await popupSettled(page, POPUP);
  expect(await page.locator('[data-wallet-profile-card-backdrop]').evaluate((backdrop) => getComputedStyle(backdrop).backdropFilter)).toMatch(/blur\((?!0px)/);
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(SOURCE)).toBeFocused();
  await expect(page.locator(SOURCE)).toBeVisible();
  await page.locator(SOURCE).press('Enter');
  await expect(page.locator(CARD)).toBeVisible();
  await popupSettled(page, POPUP);
  await page.locator(POPUP).click({position: {x: 5, y: 5}});
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(SOURCE)).toBeFocused();
});

test('an Escape during the opening flight leaves no card and can reopen', async({page}) => {
  await openCard(page);
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  // Click in the page avoids Playwright waiting for the opening animation to settle.
  await page.locator(SOURCE).evaluate((source: HTMLElement) => source.click());
  await page.waitForSelector(`${POPUP}.active`, {state: 'attached'});
  await page.keyboard.press('Escape');
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator(SOURCE)).toBeFocused();
  await page.locator(SOURCE).press('Enter');
  await expect(page.locator(CARD)).toBeVisible();
});

for(const direction of ['ltr', 'rtl'] as const) for(const level of [0, 1, 2]) {
  test(`fits a narrow ${direction} viewport at animation level ${level}`, async({page}) => {
    await page.setViewportSize({width: 375, height: 667});
    await page.evaluate(async({direction, level}) => {
      window.popupSandbox.setDirection(direction);
      const {useAppSettings} = await window.e2eImport('/src/stores/appSettings.ts');
      const [, setAppSettings] = useAppSettings();
      setAppSettings('liteMode', 'animations', level === 0);
      setAppSettings('liteMode', 'motion', level < 2);
      for(const value of [0, 1, 2]) {
        document.body.classList.toggle(`animation-level-${value}`, level === 0 ? value === 0 : value > 0 && value <= level);
      }
    }, {direction, level});
    await openCard(page);
    const frames = await page.locator(CARD).evaluate((card) => card.getAnimations().flatMap((animation) =>
      (animation.effect as KeyframeEffect).getKeyframes().map((frame) => frame.transform)
    ));
    if(level === 0) expect(frames).toHaveLength(0);
    else if(level === 1) expect(frames.every((transform) => !transform || transform === 'none')).toBe(true);
    else expect(frames.some((transform) => typeof transform === 'string' && transform.includes('rotate'))).toBe(true);
    await popupSettled(page, POPUP);
    await expectPaintedCard(page);
    if(level === 2) await page.screenshot({path: `tmp/wallet-profile-card-${direction}.png`});
    const bounds = await page.locator(CARD).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(667);
    await page.keyboard.press('Escape');
    await expect(page.locator(POPUP)).toHaveCount(0);
    await expect(page.locator(SOURCE)).toBeFocused();
  });
}

test('the profile preview paints without creating WebGL contexts', async({page}) => {
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (window as typeof window & {walletWebGLRequests: number}).walletWebGLRequests = 0;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if(type === 'webgl' || type === 'webgl2') {
        ++(window as typeof window & {walletWebGLRequests: number}).walletWebGLRequests;
      }
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await openCard(page);
  await popupSettled(page, POPUP);
  expect(await page.evaluate(() => (window as typeof window & {walletWebGLRequests: number}).walletWebGLRequests)).toBe(0);
  await expectPaintedCard(page);
  await expect(page.locator(CARD)).toContainText('1,720');
});
