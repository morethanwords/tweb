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

/** opens the chat and waits for it to be on screen */
export async function openChat(page: Page, peerId: number) {
  await page.evaluate((peerId) => (window as any).appImManager.setInnerPeer({peerId}), peerId);
  await page.waitForFunction((peerId) => {
    const chat = (window as any).appImManager.chat;
    return chat?.peerId === peerId && chat.bubbles.chatInner.isConnected && !chat.setPeerPromise;
  }, peerId);
}
