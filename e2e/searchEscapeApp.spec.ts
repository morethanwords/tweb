import {expect, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * Opening the chat list's search resizes the left column for a moment (~0.5 s). An Escape pressed in that moment -
 * a search opened by mistake, or Ctrl+F and straight back - was taken and dropped: the search stayed open with no
 * sign of it. It closes once the column is done resizing instead.
 *
 * Like the other signed-in specs it runs against an authorized preview and skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/searchEscapeApp.spec.ts
 */

test.describe('the chat list search', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');
  test.use({viewport: {width: 1280, height: 800}});

  test('closes on an Escape pressed as it opens', async({page}) => {
    test.setTimeout(4 * 60_000);
    await openChatList(page);
    const isOpen = () => page.evaluate(() => (window as any).appSidebarLeft.isSearchActive as boolean);

    for(let i = 0; i < 3; ++i) {
      await page.locator('#column-left .input-search input').first().click();
      // * in the column's resize, which the opening sets off
      await expect.poll(() => page.evaluate(() => (window as any).appSidebarLeft.isAnimatingCollapse as boolean), {
        message: `round ${i}: the column resizes as the search opens`,
        timeout: 3000,
        intervals: [16]
      }).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(isOpen, {timeout: 3000}).toBe(false);
      // * the column at rest before the next round
      await page.waitForTimeout(1000);
    }
  });
});
