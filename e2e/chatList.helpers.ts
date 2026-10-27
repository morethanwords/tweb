import {Page} from '@playwright/test';

/**
 * Opens the signed-in client of an authorized preview and waits for its chat list to show at least
 * `minRows` rows, and a moment more for the rest of the batch
 */
export async function openChatList(page: Page, {query = '', minRows = 1}: {query?: string, minRows?: number} = {}) {
  await page.goto('/' + query);
  await page.waitForFunction((minRows) => {
    const w = window as any;
    return w.appDialogsManager?.xd && w.apiManagerProxy && w.rootScope?.managers && w.appImManager &&
      document.querySelectorAll('#column-left .chatlist-chat').length >= minRows;
  }, minRows, {timeout: 180_000});
  // * the list renders its rows in batches
  await page.waitForTimeout(3000);
}
