import {expect, Page, test} from '@playwright/test';
import {openSavedMessages, sendSavedText} from './savedMessages.helpers';

/*
 * An edit longer than the message limit is not sent: the server would refuse it, and the user was told only that
 * "an error occurred". As tdesktop does, the field stays as it is and a toast says by how many characters to cut
 * it. An edit right at the limit goes, also with spaces after it, which are trimmed before it is sent.
 *
 * It sends a message to Saved Messages, edits it and deletes it, so like the other signed-in specs it runs against
 * an authorized preview and skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/editLimitApp.spec.ts
 */

test.describe('an edit over the message limit', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('stays in the field with the excess told, and one at the limit goes', async({page}) => {
    test.setTimeout(4 * 60_000);
    await openSavedMessages(page);
    const text = 'edit limit ' + Date.now();
    const sentMid = await sendSavedText(page, text);
    const limit: number = await page.evaluate(async() => {
      return (await (window as any).appImManager.managers.apiManager.getConfig()).message_length_max;
    });

    try {
      const toasts = await watchToasts(page);
      await edit(page, sentMid, 'y'.repeat(limit + 7));
      await page.keyboard.press('Enter');

      await expect.poll(() => toasts()).toContainEqual(expect.stringContaining('shorter by 7 characters'));
      // * still being edited, with all of it, and the message as it was
      expect(await page.evaluate(() => (window as any).appImManager.chat.input.editMsgId)).toBe(sentMid);
      expect(await page.evaluate(() => (window as any).appImManager.chat.input.messageInput.textContent.length)).toBe(limit + 7);
      expect(await messageText(page, sentMid)).toBe(text);

      // * cut to the limit, it goes - the spaces after it too, which the text loses on its way
      await edit(page, sentMid, 'z'.repeat(limit) + '   ');
      await page.keyboard.press('Enter');
      await expect.poll(() => messageText(page, sentMid), {timeout: 30_000}).toBe('z'.repeat(limit));
      expect(await page.evaluate(() => (window as any).appImManager.chat.input.editMsgId)).toBeFalsy();
    } finally {
      await page.evaluate(async(mid) => {
        const appImManager = (window as any).appImManager;
        appImManager.chat.input.clearHelper?.();
        await appImManager.managers.appMessagesManager.deleteMessages(appImManager.chat.peerId, [mid], true);
      }, sentMid);
    }
  });
});

async function watchToasts(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = (window as any).__editLimitToasts = [];
    new MutationObserver(() => {
      document.querySelectorAll('.toast').forEach((toast) => {
        if(!seen.includes(toast.textContent)) seen.push(toast.textContent);
      });
    }).observe(document.body, {childList: true, subtree: true});
  });

  return () => page.evaluate(() => (window as any).__editLimitToasts as string[]);
}

async function edit(page: Page, mid: number, value: string) {
  await page.evaluate(async({mid, value}) => {
    const input = (window as any).appImManager.chat.input;
    if(input.editMsgId !== mid) input.initMessageEditing(mid);
    await new Promise((resolve) => setTimeout(resolve, 500));
    input.setInputValue(value);
    input.messageInput.focus();
  }, {mid, value});
}

function messageText(page: Page, mid: number) {
  return page.evaluate(async(mid) => {
    const appImManager = (window as any).appImManager;
    const message = await appImManager.managers.appMessagesManager.getMessageByPeer(appImManager.chat.peerId, mid);
    return message?.message as string;
  }, mid);
}
