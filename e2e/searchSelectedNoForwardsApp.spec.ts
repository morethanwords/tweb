import {expect, Page, test} from '@playwright/test';
import {editMessageLocally, openChatList} from './chatList.helpers';

/*
 * Text selected in a message of a chat that forbids copying is not offered to be searched for: the
 * chat's search field would hand it out to be copied. A message that can be copied keeps the item, and
 * the item to copy the selection follows the same rule.
 *
 * A message of Saved Messages with text is made protected locally (an edit handed to the update pipeline,
 * the way the server's would be - nothing is sent), its text selected and the message's menu opened on it;
 * the message is put back after.
 *
 * It needs a signed-in account, so it runs against an authorized preview, and skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/searchSelectedNoForwardsApp.spec.ts
 */

type Found = {peerId: number, mid: number, original: any};

/** a message of Saved Messages with text of its own */
function findMessage(page: Page): Promise<Found> {
  return page.evaluate(async() => {
    const w = window as any;
    const managers = w.rootScope.managers;
    const peerId = w.rootScope.myId;
    const {history} = await managers.appMessagesManager.getHistory({peerId, limit: 50, offsetId: 0});
    for(const mid of history) {
      const message = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
      if(message?._ === 'message' && !message.grouped_id && !message.media && !message.rich_message && message.message?.trim().length > 3) {
        return {peerId, mid, original: message};
      }
    }
  });
}

/** selects the message's text and opens its menu on it; returns the items the menu offers */
async function menuOnSelection(page: Page, {mid}: Found) {
  const at = await page.evaluate((mid) => {
    const bubble = (window as any).appImManager.chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    bubble.scrollIntoView({block: 'center'});
    const message: HTMLElement = bubble.querySelector('.message');
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.textContent.trim().length > 3 && !node.parentElement.closest('.time') ?
        NodeFilter.FILTER_ACCEPT :
        NodeFilter.FILTER_REJECT
    });
    const text = walker.nextNode();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(text.textContent.length, 4));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = range.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, selected: selection.toString()};
  }, mid);
  expect(at.selected, 'nothing of the message\'s text got selected').toBeTruthy();

  await page.mouse.click(at.x, at.y, {button: 'right'});
  const menu = page.locator('#bubble-contextmenu');
  await expect(menu).toBeVisible();
  // * without its icon's glyph, once every item has its text
  const readItems = async() => (await menu.locator('.btn-menu-item').allInnerTexts())
  .map((item) => item.replace(/[^\p{L}\p{N} ]/gu, '').trim());
  await expect.poll(async() => {
    const items = await readItems();
    return items.length && items.every(Boolean);
  }, {message: 'the menu\'s items have no text'}).toBe(true);
  const items = await readItems();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  return items;
}

test.describe('text selected in a message', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  let found: Found;
  test.beforeEach(async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    found = await findMessage(page);
    test.skip(!found, 'no message with text in Saved Messages');
    // * opened at the message: it may lie past what the chat draws first
    await page.evaluate(({peerId, mid}) => (window as any).appImManager.setInnerPeer({peerId, lastMsgId: mid}), found);
    await page.waitForFunction(({peerId, mid}) => {
      const chat = (window as any).appImManager.chat;
      return chat?.peerId === peerId && !chat.setPeerPromise && !!chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"] .message`);
    }, found);
  });

  test.afterEach(async({page}) => {
    if(found) await editMessageLocally(page, found.original).catch(() => {});
  });

  test('is offered to be searched for, unless the message forbids copying', async({page}) => {
    const free = await menuOnSelection(page, found);
    expect(free, 'a message that can be copied lost the search for its selection').toContain('Search Selected Text');
    expect(free).toContain('Copy Selected Text');

    await editMessageLocally(page, {...found.original, pFlags: {...found.original.pFlags, noforwards: true}});
    await expect.poll(() => page.evaluate((mid) => {
      const bubble = (window as any).appImManager.chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
      return !!bubble?.classList.contains('no-forwards');
    }, found.mid), {message: 'the message did not become protected'}).toBe(true);

    const kept = await menuOnSelection(page, found);
    expect(kept, 'the selection of a protected message can be put into the search field').not.toContain('Search Selected Text');
    expect(kept).not.toContain('Copy Selected Text');
  });
});
