import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * The QR screen: a compact panel above everything on a desktop, the whole screen on a phone. The panel stands above
 * a context menu, the media viewer and another popup, and a menu or the share picker opened from it above the panel.
 * SHOTS_DIR (optional) takes a screenshot of each state, for looking at.
 */

const SHOTS = process.env.QR_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if(SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`});
}

/** Whether what stands at the middle of the panel is the panel's own */
function topmostIsPanel(page: Page) {
  return page.evaluate(() => {
    const rect = document.querySelector('.popup-container').getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !!top.closest('.popup-container');
  });
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
      }
    });
  }
}

test('QR screen stands above menus, the media viewer and other popups', async({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'toggleReadDate/lastSeen')).toBeNull();
  expect(await openStory(page, 'myQrCode')).toBeNull();
  await page.locator('.popup button[aria-label="Share QR Code"]').waitFor();
  await page.waitForTimeout(600);
  expect(await topmostIsPanel(page)).toBe(true);

  // a menu, the media viewer and a popup, all at the z-index they have in the app and mounted after the panel
  await page.evaluate(() => {
    for(const className of ['btn-menu active', 'media-viewer-whole', 'popup active']) {
      const element = document.createElement('div');
      element.className = className;
      element.style.cssText = 'position:fixed;inset:0;z-index:4;opacity:1;visibility:visible;background:red';
      document.body.append(element);
    }
  });
  expect(await topmostIsPanel(page)).toBe(true);
  await shot(page, 'desktop-over-everything');

  // the picker that Share opens, and a toast, stand over the panel
  await page.locator('.popup-container button[aria-label="Share QR Code"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.popup')].some((popup) => popup.style.zIndex === '6'));
  await page.waitForTimeout(600);
  await shot(page, 'desktop-share-picker');
  const pickerOnTop = await page.evaluate(() => {
    const picker = [...document.querySelectorAll<HTMLElement>('.popup')].find((popup) => popup.style.zIndex === '6');
    const rect = picker.querySelector('.popup-container').getBoundingClientRect();
    return !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + 30)?.closest('.popup-container') && document.elementFromPoint(rect.left + rect.width / 2, rect.top + 30).closest('.popup') === picker;
  });
  expect(pickerOnTop).toBe(true);
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
  const onTop = await page.evaluate(() => {
    const toast = [...document.querySelectorAll<HTMLElement>('.toast')].pop();
    const rect = toast.getBoundingClientRect();
    return !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.toast');
  });
  expect(onTop).toBe(true);
});
