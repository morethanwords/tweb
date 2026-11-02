import {Page} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/** Opens the account's Saved Messages in an authorized preview and waits for its history to be in, to its end */
export async function openSavedMessages(page: Page) {
  await openChatList(page);
  await page.evaluate(() => {
    const {appImManager, rootScope} = window as any;
    appImManager.setInnerPeer({peerId: rootScope.myId});
  });
  await page.waitForFunction(() => {
    const {appImManager, rootScope} = window as any;
    const chat = appImManager.chat;
    return chat?.peerId === rootScope.myId && chat.bubbles.scrollable.loadedAll.bottom;
  }, null, {timeout: 60_000});
  await page.waitForTimeout(1500);
}

/** Sends `text` to Saved Messages and returns its id once the server has given it, the message at the list's end */
export async function sendSavedText(page: Page, text: string): Promise<number> {
  await page.evaluate((text) => {
    const {appImManager, rootScope} = window as any;
    appImManager.managers.appMessagesManager.sendText({peerId: rootScope.myId, text});
  }, text);
  return page.waitForFunction((text) => {
    const bubble = Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubbles-inner .bubble'))
    .find((bubble) => bubble.querySelector('.message')?.textContent.startsWith(text));
    return bubble && !bubble.classList.contains('is-sending') && Number.isInteger(+bubble.dataset.mid) && +bubble.dataset.mid;
  }, text, {timeout: 15_000}).then((handle) => handle.jsonValue() as Promise<number>);
}
