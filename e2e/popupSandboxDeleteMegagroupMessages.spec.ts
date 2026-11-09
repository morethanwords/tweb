import {expect, test} from '@playwright/test';
import {openStory, popupSettled, preparePopupSandbox} from './popupSandbox.helpers';

const POPUP = '.popup-delete-megagroup-messages';

for(const direction of ['ltr', 'rtl'] as const) {
  for(const height of [720, 420]) {
    test(`moderation options are not clipped (${direction}, ${height}px)`, async({page}) => {
      await page.setViewportSize({width: 800, height});
      await preparePopupSandbox(page, false, {a11y: true});
      await page.evaluate((dir) => window.popupSandbox.setDirection(dir), direction);
      expect(await openStory(page, 'deleteMegagroupMessages')).toBeNull();
      await popupSettled(page, POPUP);

      const popup = page.locator(POPUP);
      const permissions = popup.locator(`${POPUP}-permissions`);
      // A collapsed Section's padding used to leave a clipped white card below the options.
      expect((await permissions.boundingBox()).height).toBe(0);
      const ban = popup.locator('.row').filter({hasText: /^Ban Alice$/});
      await ban.click();
      const toggle = popup.locator(`${POPUP}-expand-row`);
      await toggle.scrollIntoViewIfNeeded();
      const toggleBox = await toggle.boundingBox();
      const scrollBox = await popup.locator('.popup-scrollable').boundingBox();
      const buttonsBox = await popup.locator('.popup-buttons').boundingBox();
      expect(toggleBox.y).toBeGreaterThanOrEqual(scrollBox.y);
      expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height);
      expect(scrollBox.y + scrollBox.height).toBeLessThanOrEqual(buttonsBox.y);

      await toggle.click();
      await popupSettled(page, POPUP);
      expect((await permissions.boundingBox()).height).toBeGreaterThan(0);
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await popupSettled(page, POPUP);
      expect((await permissions.boundingBox()).height).toBe(0);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
    });
  }
}
