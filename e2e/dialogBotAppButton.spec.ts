import {expect, Page, test} from '@playwright/test';

/*
 * The "Open" button a chat-list row shows for a bot with a main mini app
 * (`DialogElement.createBotAppButton`), as the official apps have it: it opens the
 * app and not the chat, takes the place of the pin, and gives way to the unread
 * badges - in that very place, so that neither the button nor the badge jumps aside
 * while the one shrinks and the other grows.
 *
 * The unread states are rendered locally only: the row is handed a copy of its
 * dialog with the counters it is meant to show, and nothing is sent anywhere - the
 * app itself is not opened either, `openWebApp` is replaced for the test.
 *
 * It needs a signed-in account with such a bot in its chat list, so like the other
 * signed-in specs it runs against an authorized preview, and skips rather than
 * reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/dialogBotAppButton.spec.ts
 */

const BUTTON = '.dialog-subtitle-badge-bot-app';
const READ = {
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  unread_poll_votes_count: 0
};

async function openChatList(page: Page, query = '') {
  await page.goto('/' + query);
  await page.waitForFunction(() => {
    const w = window as any;
    return w.appDialogsManager?.xd && w.apiManagerProxy && w.rootScope?.managers && w.appImManager &&
      document.querySelectorAll('#column-left .chatlist-chat').length > 0;
  }, null, {timeout: 180_000});
  // * the list renders its rows in batches
  await page.waitForTimeout(3000);
}

/** a bot with a main mini app among the rows the main list has rendered */
function findBotRow(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#column-left .chatlist-chat[data-peer-id]'));
    const row = rows.find((row) => {
      const peerId = +row.dataset.peerId;
      const user = peerId > 0 && w.apiManagerProxy.getUser(peerId);
      return user?.pFlags?.bot_has_main_app && w.appDialogsManager.xd.getDialogElement(peerId)?.isMainList;
    });
    return row && +row.dataset.peerId;
  });
}

/**
 * Renders the row with its dialog patched, and reports where the button and the
 * unread badge stood on every frame of the transition that follows
 */
function renderDialog(page: Page, peerId: number, patch: Record<string, any>) {
  return page.evaluate(async({peerId, patch}) => {
    const w = window as any;
    const row = document.querySelector(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`);
    const center = (selector: string) => {
      const element = row.querySelector(selector);
      if(!element) return null;
      const rect = element.getBoundingClientRect();
      return (rect.left + rect.right) / 2;
    };
    const frames: {button: number, unread: number}[] = [];
    const snapshot = () => frames.push({button: center('.dialog-subtitle-badge-bot-app'), unread: center('.dialog-subtitle-badge-unread')});

    const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
    const dialogElement = w.appDialogsManager.xd.getDialogElement(peerId);
    snapshot();
    const start = performance.now();
    await w.appDialogsManager.setUnreadMessagesN({
      dialog: {...dialog, ...patch, pFlags: {...dialog.pFlags, unread_mark: undefined, ...patch.pFlags}},
      dialogElement
    });

    // * a little past the badges' own transition
    return new Promise<typeof frames>((resolve) => {
      const tick = () => {
        snapshot();
        if(performance.now() - start < 600) requestAnimationFrame(tick);
        else resolve(frames);
      };
      tick();
    });
  }, {peerId, patch});
}

/** how far one of them moved, start to end, while it was there */
function drift(frames: {button: number, unread: number}[], key: 'button' | 'unread') {
  const positions = frames.map((frame) => frame[key]).filter((position) => position !== null);
  return positions.length ? Math.max(...positions) - Math.min(...positions) : 0;
}

test.describe('the main mini app button of a bot row', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // the chat list is a column beside the conversation only on a desktop-sized window
  test.use({viewport: {width: 1280, height: 800}});

  test('opens the app, replaces the pin and swaps with the unread badge in place', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);

    const peerId = await findBotRow(page);
    test.skip(!peerId, 'no bot with a main mini app in the chat list of this account');

    const row = page.locator(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`);
    const button = row.locator(BUTTON);
    await row.scrollIntoViewIfNeeded();

    try {
      await renderDialog(page, peerId, READ);
      await expect(row.locator(`${BUTTON}.is-visible`)).toHaveCount(1);
      // * the button takes the place of the pin, whether the chat is pinned or not
      await expect(row.locator('.dialog-subtitle-badge-pinned')).toHaveCount(0);

      // * it opens the app, and only the app
      const before = await page.evaluate(() => {
        const w = window as any;
        w.__openedWebApps = [];
        w.appImManager.openWebApp = (options: any) => {
          w.__openedWebApps.push(options);
          return Promise.resolve();
        };
        return {chat: w.appImManager.chat?.peerId, hash: location.hash};
      });
      await button.click();
      const after = await page.evaluate(() => {
        const w = window as any;
        return {chat: w.appImManager.chat?.peerId, hash: location.hash, opened: w.__openedWebApps};
      });
      expect(after.opened).toEqual([{botId: peerId, main: true, peerId}]);
      expect({chat: after.chat, hash: after.hash}, 'the chat was opened too').toEqual(before);

      // * an unread badge takes its place - right where it stands
      const toUnread = await renderDialog(page, peerId, {...READ, unread_count: 3});
      await expect(row.locator(BUTTON)).toHaveCount(0);
      await expect(row.locator('.dialog-subtitle-badge-unread.is-visible')).toHaveText('3');
      expect(drift(toUnread, 'button'), 'the leaving button moved').toBeLessThanOrEqual(1);
      expect(drift(toUnread, 'unread'), 'the coming badge moved').toBeLessThanOrEqual(1);

      // * so does anything else unread with no unread message under it (a mention always has one)
      for(const patch of [{unread_reactions_count: 1}, {unread_poll_votes_count: 1}, {pFlags: {unread_mark: true}}]) {
        await renderDialog(page, peerId, {...READ, ...patch});
        await expect(row.locator(BUTTON), JSON.stringify(patch)).toHaveCount(0);
      }

      // * and back, with the badge leaving from where it stood
      await renderDialog(page, peerId, {...READ, unread_count: 3});
      const toRead = await renderDialog(page, peerId, READ);
      await expect(row.locator(`${BUTTON}.is-visible`)).toHaveCount(1);
      await expect(row.locator('.dialog-subtitle-badge-unread')).toHaveCount(0);
      expect(drift(toRead, 'button'), 'the coming button moved').toBeLessThanOrEqual(1);
      expect(drift(toRead, 'unread'), 'the leaving badge moved').toBeLessThanOrEqual(1);

      // * selecting chats is what a press on a row does then, so the button makes way
      await page.evaluate(() => (window as any).appDialogsManager.selection.toggleSelection(true, true));
      await expect(button).toBeHidden();
      await page.evaluate(() => (window as any).appDialogsManager.selection.cancelSelection());
      await expect(button).toBeVisible();
    } finally {
      // * whatever the account really has
      await renderDialog(page, peerId, {}).catch(() => {});
    }
  });

  test('is a named control of its own with the a11y layer', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page, '?a11y=1');

    const peerId = await findBotRow(page);
    test.skip(!peerId, 'no bot with a main mini app in the chat list of this account');

    const row = page.locator(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`);
    await row.scrollIntoViewIfNeeded();
    await renderDialog(page, peerId, READ);

    const button = row.locator(`${BUTTON}.is-visible`);
    await expect(button).toHaveJSProperty('tagName', 'BUTTON');
    // * "Open" on every such row: the bot's name is what tells them apart
    const description = await button.evaluate((element) => {
      return document.getElementById(element.getAttribute('aria-describedby'))?.textContent;
    });
    expect(description).toBe(await row.locator('.peer-title').first().textContent());

    await row.focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
  });
});
