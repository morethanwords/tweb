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

test('Tab stays in the dialog and reaches Close, which restores focus', async({page}) => {
  await openCard(page);
  await popupSettled(page, POPUP);
  const close = page.locator(POPUP).getByRole('button', {name: 'Close', exact: true});
  let reachedClose = false;
  for(let step = 0; step < 12; ++step) {
    await page.keyboard.press('Tab');
    expect(await page.locator(POPUP).evaluate((popup) => popup.contains(document.activeElement))).toBe(true);
    if(await close.evaluate((button) => button === document.activeElement)) {
      reachedClose = true;
      break;
    }
  }
  expect(reachedClose).toBe(true);
  await page.keyboard.press('Enter');
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
    const before = (await cdp.send('Performance.getMetrics')).metrics.find(({name}) => name === 'LayoutCount').value;
    await popupSettled(page, POPUP);
    const after = (await cdp.send('Performance.getMetrics')).metrics.find(({name}) => name === 'LayoutCount').value;
    // Initial sizing may finish, but the 640ms transform flight must not lay out each frame.
    expect(after - before).toBeLessThanOrEqual(6);
  } finally {
    await cdp.detach();
  }
});

test.beforeEach(async({page}) => {
  await preparePopupSandbox(page, false, {a11y: true});
});

test('blurs the background, closes with Escape and restores the balance button', async({page}) => {
  await openCard(page);
  await popupSettled(page, POPUP);
  expect(await page.locator(POPUP).evaluate((popup) => getComputedStyle(popup, '::before').backdropFilter)).toMatch(/blur\((?!0px)/);
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
