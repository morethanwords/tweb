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
  await page.locator('.popup button:has-text("Free")').click();
  await page.locator('.btn-menu.active').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'desktop-fee-menu');
  expect(await isOnTop(page, '.btn-menu.active')).toBe(true);
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
