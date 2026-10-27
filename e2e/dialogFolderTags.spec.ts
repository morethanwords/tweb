import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * Folder tags, as the official apps have them: a row of a folder's chat list wears a tag for
 * every other folder with a colour its chat is in, under the message, and is a line taller for
 * it - the rows below make room, and a row above the screen that grows or shrinks leaves what is on
 * it where it was. They are Premium's, so an account without it sees a locked
 * switch in the folders settings, which offers Premium.
 *
 * Nothing is sent anywhere: a row is handed a copy of its dialog with the folder it is meant to be
 * in, and on an account without Premium, or with the tags off, the two are turned on in the page
 * only - an account that has both shows its tags as they are. It needs a signed-in account
 * with a folder that has a colour, so like the other signed-in specs it runs against an
 * authorized preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/dialogFolderTags.spec.ts
 */

const ROW_HEIGHT = 72;
const TAGGED_ROW_HEIGHT = 82;

type Setup = {
  peerId: number,
  nextPeerId: number,
  title: string,
  indexKey: string,
  wasTagsEnabled: boolean,
  wasPremium: boolean,
  /** whether the switch and Premium were put on for the test, and have to be taken back */
  forced: boolean
};

/**
 * Shows the tags in this page, and picks two neighbouring rows of All chats and a folder with a
 * colour for the first of them to be in
 */
function setUp(page: Page): Promise<Setup> {
  return page.evaluate(async() => {
    const w = window as any;
    const filters: any[] = await w.rootScope.managers.filtersStorage.getDialogFilters();
    const filter = filters.find((filter) => filter.id > 1 && filter.color !== undefined && filter.color >= 0);
    if(!filter) return null;

    const rows = Array.from(document.querySelectorAll<HTMLElement>('#folders-container .chatlist-chat[data-peer-id]'))
    .filter((row) => row.offsetParent)
    .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const pair = rows.findIndex((row, idx) => {
      const next = rows[idx + 1];
      return next && parseFloat(next.style.top) - parseFloat(row.style.top) === row.offsetHeight;
    });
    if(pair === -1) return null;

    // * the switch is asked of the server as the session starts
    let tagsEnabled: boolean;
    for(let i = 0; i < 40 && tagsEnabled === undefined; ++i) {
      tagsEnabled = (await w.rootScope.managers.appStateManager.getState()).filtersTagsEnabled;
      if(tagsEnabled === undefined) await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const setup = {
      peerId: +rows[pair].dataset.peerId,
      nextPeerId: +rows[pair + 1].dataset.peerId,
      title: filter.title.text,
      indexKey: 'index_' + filter.localId,
      wasTagsEnabled: tagsEnabled,
      wasPremium: w.rootScope.premium,
      forced: !(w.rootScope.premium && tagsEnabled)
    };

    if(setup.forced) {
      w.rootScope.premium = true;
      w.rootScope.dispatchEventSingle('premium_toggle', true);
      await w.rootScope.managers.appStateManager.pushToState('filtersTagsEnabled', true);
    }

    return setup;
  });
}

function tearDown(page: Page, setup: Setup) {
  return page.evaluate(async(setup) => {
    const w = window as any;
    w.appDialogsManager.forumTab = undefined;
    w.appDialogsManager.onChatListNarrowChange();
    if(setup.forced) {
      await w.rootScope.managers.appStateManager.pushToState('filtersTagsEnabled', setup.wasTagsEnabled);
      w.rootScope.premium = setup.wasPremium;
      w.rootScope.dispatchEventSingle('premium_toggle', setup.wasPremium);
    }
    // * whatever the account really has
    const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(setup.peerId);
    await w.appDialogsManager.setUnreadMessagesN({dialog, dialogElement: w.appDialogsManager.xd.getDialogElement(setup.peerId)});
  }, setup);
}

/** Renders the row with its dialog in the folder or out of every one */
function renderDialog(page: Page, setup: Setup, inFolder: boolean) {
  return page.evaluate(async({setup, inFolder}) => {
    const w = window as any;
    const dialog = {...await w.rootScope.managers.appMessagesManager.getDialogOnly(setup.peerId)};
    for(const key in dialog) {
      if(key.startsWith('index_') && key !== 'index_0') delete dialog[key];
    }
    if(inFolder) dialog[setup.indexKey] = dialog.index_0;

    await w.appDialogsManager.setUnreadMessagesN({dialog, dialogElement: w.appDialogsManager.xd.getDialogElement(setup.peerId)});
    // * the rows below slide to their places
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, {setup, inFolder});
}

function topOf(page: Page, peerId: number) {
  return page.evaluate((peerId) => {
    return parseFloat(document.querySelector<HTMLElement>(`#folders-container .chatlist-chat[data-peer-id="${peerId}"]`).style.top);
  }, peerId);
}

/** The rows of All chats the screen shows, top to bottom, with where they are on it */
function rowsOnScreen(page: Page) {
  return page.evaluate(() => {
    const list = (window as any).appDialogsManager.xd.sortedList.list as HTMLElement;
    const host = list.closest('.scrollable').getBoundingClientRect();
    return Array.from(list.querySelectorAll<HTMLElement>('.chatlist-chat[data-peer-id]'))
    .map((row) => ({peerId: +row.dataset.peerId, rect: row.getBoundingClientRect()}))
    .filter(({rect}) => rect.bottom > host.top && rect.top < host.bottom)
    .sort((a, b) => a.rect.top - b.rect.top)
    .map(({peerId, rect}) => ({peerId, y: rect.top}));
  });
}

/** `rowsOnScreen` once they hold still - a list still filling in after the page loads moves them itself */
async function settledRowsOnScreen(page: Page) {
  let rows = await rowsOnScreen(page);
  for(let i = 0; i < 20; ++i) {
    await page.waitForTimeout(400);
    const next = await rowsOnScreen(page);
    if(JSON.stringify(next) === JSON.stringify(rows)) {
      return next;
    }

    rows = next;
  }

  return rows;
}

function scrollChatList(page: Page, top: number) {
  return page.evaluate(async(top) => {
    const scrollable = (window as any).appDialogsManager.xd.sortedList.list.closest('.scrollable') as HTMLElement;
    scrollable.scrollTop = top;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return scrollable.scrollTop;
  }, top);
}

test.describe('folder tags in the chat list', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // the chat list is a column beside the conversation only on a desktop-sized window
  test.use({viewport: {width: 1280, height: 800}});

  test('a chat in a folder with a colour wears its tag, a line taller', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page, {minRows: 3});

    const setup = await setUp(page);
    test.skip(!setup, 'no folder with a colour, or no two rows on screen, in this account');

    const row = page.locator(`#folders-container .chatlist-chat[data-peer-id="${setup.peerId}"]`);
    try {
      await renderDialog(page, setup, false);
      await expect(row).not.toHaveClass(/has-folder-tags/);
      const nextTop = await topOf(page, setup.nextPeerId);

      await renderDialog(page, setup, true);
      await expect(row).toHaveClass(/has-folder-tags/);
      await expect(row.locator('.folder-tag').first()).toHaveText(setup.title);
      expect((await row.boundingBox()).height).toBe(TAGGED_ROW_HEIGHT);
      // * the tags go under the message
      const [subtitle, tags] = await Promise.all([
        row.locator('.dialog-subtitle').boundingBox(),
        row.locator('.dialog-folder-tags').boundingBox()
      ]);
      expect(tags.y).toBeGreaterThanOrEqual(subtitle.y + subtitle.height);
      expect(await topOf(page, setup.nextPeerId), 'the row below did not make room').toBe(nextTop + TAGGED_ROW_HEIGHT - ROW_HEIGHT);

      // * a list down to its avatars has no room for them, and its rows go back to their height
      await page.evaluate(() => {
        const w = window as any;
        w.appDialogsManager.forumTab = {};
        w.appDialogsManager.onChatListNarrowChange();
      });
      await expect(row).not.toHaveClass(/has-folder-tags/);
      await page.waitForTimeout(500);
      expect(await topOf(page, setup.nextPeerId)).toBe(nextTop);
      await page.evaluate(() => {
        const w = window as any;
        w.appDialogsManager.forumTab = undefined;
        w.appDialogsManager.onChatListNarrowChange();
      });
      await expect(row).toHaveClass(/has-folder-tags/);

      // * and so does a chat that leaves the folder
      await renderDialog(page, setup, false);
      await expect(row).not.toHaveClass(/has-folder-tags/);
      expect(await topOf(page, setup.nextPeerId)).toBe(nextTop);
    } finally {
      await tearDown(page, setup).catch(() => {});
    }
  });

  test('what is on screen stays put when a row above it gets its tags or loses them', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page, {minRows: 3});

    const setup = await setUp(page);
    test.skip(!setup, 'no folder with a colour, or no two rows on screen, in this account');

    try {
      await renderDialog(page, setup, false);
      const rowTop = await topOf(page, setup.peerId);
      // * the row goes above the screen, a few rows' height up
      const scrolled = await scrollChatList(page, rowTop + 4 * TAGGED_ROW_HEIGHT);
      test.skip(scrolled < rowTop + 4 * TAGGED_ROW_HEIGHT, 'the chat list is too short to scroll a row out of sight');

      const before = await settledRowsOnScreen(page);
      expect(before.map(({peerId}) => peerId)).not.toContain(setup.peerId);

      // * a line taller above the screen
      await renderDialog(page, setup, true);
      expect(await rowsOnScreen(page), 'the rows on screen moved when one above it got its tags').toEqual(before);

      // * the list narrows, and every row loses its tags at once: the one at the top of the screen
      // * stays, those under it close up on it as the rows on screen lose theirs
      await page.evaluate(() => {
        const w = window as any;
        w.appDialogsManager.forumTab = {};
        w.appDialogsManager.onChatListNarrowChange();
      });
      await page.waitForTimeout(500);
      expect((await rowsOnScreen(page))[0], 'the row at the top of the screen moved when the list narrowed').toEqual(before[0]);
      await page.evaluate(() => {
        const w = window as any;
        w.appDialogsManager.forumTab = undefined;
        w.appDialogsManager.onChatListNarrowChange();
      });
      await page.waitForTimeout(500);
      expect(await rowsOnScreen(page)).toEqual(before);

      await renderDialog(page, setup, false);
      expect(await rowsOnScreen(page), 'the rows on screen moved when one above it lost its tags').toEqual(before);
    } finally {
      await tearDown(page, setup).catch(() => {});
    }
  });

  test('without Premium the switch is locked, and offers Premium', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page, {minRows: 3});

    const isPremium = await page.evaluate(() => (window as any).rootScope.premium);
    test.skip(isPremium, 'the account has Premium, and the switch is a real one');

    await page.evaluate(() => (window as any).appImManager.openUrl('tg://settings/folders/show-tags'));
    const row = page.locator('.chat-folders-container .row').filter({hasText: 'Show Folder Tags'});
    await expect(row).toBeVisible({timeout: 30_000});
    await expect(row.locator('.with-lock')).toHaveCount(1);

    await row.click();
    await expect(page.locator('.popup-premium')).toBeVisible({timeout: 30_000});
    await expect(page.locator('.popup-premium')).toContainText('Tag Your Chats');
    await expect(row.locator('input')).not.toBeChecked();
  });
});
