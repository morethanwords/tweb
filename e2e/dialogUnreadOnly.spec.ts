import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * Unread chats only, chosen in a folder's menu: the list holds the folder's unread chats and
 * nothing else, says so in a bar over it, keeps a chat that is read meanwhile where it is until
 * the list is built again - opening another folder and coming back drops it - and the bar's close
 * button brings every chat back, the archive among them. Either way the rows are swapped behind a
 * fade, never in a frame of the list that can be seen.
 *
 * It needs unread chats, so it marks two read plain chats of All chats as unread, the way "Mark as
 * unread" does (never a forum: marking one reads its topics), and takes the marks back at the end,
 * a failure half-way included - only where the mark alone makes a chat unread. It needs the
 * folder tabs too, so an account without folders is skipped. Like the other signed-in specs it
 * runs against an authorized preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/dialogUnreadOnly.spec.ts
 */

test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview: PLAYWRIGHT_BASE_URL');

/** What the open folder's list holds, top to bottom, and the rows of it that are on screen */
function getList(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    const xd = w.appDialogsManager.xd;
    const rows = Array.from(xd.scrollable.container.querySelectorAll('.chatlist-chat[data-peer-id]') as NodeListOf<HTMLElement>)
    .filter((row) => row.offsetParent)
    .map((row) => +row.dataset.peerId);
    return {
      peerIds: xd.sortedList.getSortedItems()
      .map((item: any) => item.id)
      .filter((id: any) => typeof(id) === 'number') as number[],
      rows,
      // * the Archived Chats row, pinned on top of All chats
      hasArchive: !!xd.customPinnedDialog && xd.sortedList.has(xd.customPinnedDialog)
    };
  });
}

// * the list holds the first of `expected`, in their order: a page or more, not all of them
function isStartOf(peerIds: number[], expected: number[]) {
  return !!peerIds.length && peerIds.every((peerId, idx) => peerId === expected[idx]);
}

function getUnreadPeerIds(page: Page, filterId: number) {
  return page.evaluate(async(filterId) => {
    const w = window as any;
    const {dialogs} = await w.rootScope.managers.dialogsStorage.getUnreadDialogs({filterId, limit: 1000});
    return dialogs.map((dialog: any) => dialog.peerId) as number[];
  }, filterId);
}

/**
 * Puts the unread mark on plain chats, or takes it off - only where it is the mark alone that
 * makes a chat unread: taking it off a chat with unread messages would read them
 */
function setUnreadMark(page: Page, peerIds: number[], unread: boolean) {
  return page.evaluate(async({peerIds, unread}) => {
    const managers = (window as any).rootScope.managers;
    for(const peerId of peerIds) {
      const dialog = await managers.appMessagesManager.getDialogOnly(peerId);
      if(unread || (dialog?.pFlags.unread_mark && !dialog.unread_count)) {
        await managers.appMessagesManager.markDialogUnread({peerId, read: !unread});
      }
    }
  }, {peerIds, unread});
}

async function openFolderMenuItem(page: Page, tabIndex: number, text: string) {
  await page.locator('#folders-tabs .menu-horizontal-div-item').nth(tabIndex).click({button: 'right'});
  await page.locator('.btn-menu.active .btn-menu-item').filter({hasText: text}).click();
}

type Frame = {opacity: number, rows: string, top: number};

/**
 * Every frame of the open list while `action` switches it, until it is fully shown again: how much
 * of it can be seen through the cover it fades through (`.chatlist-cover`), which rows are on
 * screen - the Archived Chats row among them - and where the first of them is
 */
async function recordSwitch(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as any;
    const frames: Frame[] = w.__unreadOnlyFrames = [];
    const record = () => {
      const container: HTMLElement = w.appDialogsManager.xd.scrollable.container;
      const viewport = container.getBoundingClientRect();
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.chatlist-chat'))
      .map((row) => ({row, rect: row.getBoundingClientRect()}))
      .filter(({row, rect}) => row.offsetParent && rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((a, b) => a.rect.top - b.rect.top);
      const cover = document.querySelector('.chatlist-cover');
      frames.push({
        opacity: cover ? 1 - +getComputedStyle(cover).opacity : 1,
        rows: rows.map(({row}) => row.dataset.peerId || 'pinned').join(),
        top: rows.length ? Math.round(rows[0].rect.top) : null
      });
      w.__unreadOnlyFrame = requestAnimationFrame(record);
    };
    record();
  });

  await action();
  // * faded out, built again, faded in
  await expect.poll(() => page.evaluate(() => {
    const frames: Frame[] = (window as any).__unreadOnlyFrames;
    return frames.some((frame) => frame.opacity === 0) && frames[frames.length - 1].opacity === 1;
  })).toBe(true);

  return page.evaluate(() => {
    const w = window as any;
    cancelAnimationFrame(w.__unreadOnlyFrame);
    return w.__unreadOnlyFrames as Frame[];
  });
}

/**
 * The rows change behind the fade only: a frame where any of the list can be seen shows the rows
 * it had, or the ones it has now - and where they are, for the bar over them comes and goes unseen
 */
function expectRowsSwappedUnseen(frames: Frame[]) {
  const [first, last] = [frames[0], frames[frames.length - 1]];
  expect(last.rows).not.toEqual(first.rows);
  const isAt = (frame: Frame, at: Frame) => frame.rows === at.rows && frame.top === at.top;
  expect(frames.filter((frame) => frame.opacity !== 0 && !isAt(frame, first) && !isAt(frame, last))).toEqual([]);
}

test('shows the unread chats only, keeps one read meanwhile until the list is built again, and takes every chat back', async({page}) => {
  await openChatList(page, {minRows: 5});
  test.skip(
    !await page.locator('#folders-tabs .menu-horizontal-div-item').first().isVisible(),
    'the account has no folders, so no folder tabs to choose the mode in'
  );

  // * from the top of All chats, so that among its unread chats they are on the first page. Plain
  // * chats only, read by the client's own measure: a forum is unread by its topics, and marking
  // * one unread reads them instead
  const marked = await page.evaluate(async() => {
    const w = window as any;
    const managers = w.rootScope.managers;
    const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit: 15});
    const candidates: number[] = [];
    for(const dialog of dialogs as any[]) {
      if(
        dialog.peerId === w.rootScope.myId ||
        dialog.pFlags.pinned ||
        await managers.appPeersManager.isForum(dialog.peerId) ||
        await managers.appMessagesManager.isDialogUnread(dialog)
      ) {
        continue;
      }

      candidates.push(dialog.peerId);
      if(candidates.length === 2) {
        break;
      }
    }

    return candidates;
  });
  test.skip(marked.length < 2, 'All chats has no two read chats to mark');

  try {
    await setUnreadMark(page, marked, true);
    await expect.poll(async() => {
      const unreadPeerIds = await getUnreadPeerIds(page, 0);
      return marked.every((peerId) => unreadPeerIds.includes(peerId));
    }).toBe(true);

    expectRowsSwappedUnseen(await recordSwitch(page, () => openFolderMenuItem(page, 0, 'Show Unread Only')));
    const bar = page.locator('.chatlist-overlay').getByText('Unread chats only');
    await expect(bar).toBeVisible();

    // * the list holds the first page or more of them, an account may have many
    const unreadPeerIds = await getUnreadPeerIds(page, 0);
    await expect.poll(async() => {
      const {peerIds} = await getList(page);
      return isStartOf(peerIds, unreadPeerIds) && marked.every((peerId) => peerIds.includes(peerId));
    }).toBe(true);
    const {peerIds: shown, rows, hasArchive} = await getList(page);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((peerId) => unreadPeerIds.includes(peerId))).toBe(true);
    expect(hasArchive).toBe(false);

    // * the chat read now stays where it is: it is the one just opened. And it stays through the
    // * updates that come after the counter has let go of it - the next message in the open chat
    const [read] = marked;
    await setUnreadMark(page, [read], false);
    await expect.poll(async() => (await getUnreadPeerIds(page, 0)).includes(read)).toBe(false);
    await page.waitForTimeout(1000);
    await page.evaluate(async(peerId) => {
      const w = window as any;
      w.appDialogsManager.xd.updateDialog(await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId));
    }, read);
    expect((await getList(page)).peerIds).toEqual(shown);

    // * the active folder offers every chat back instead
    await page.locator('#folders-tabs .menu-horizontal-div-item').first().click({button: 'right'});
    await expect(page.locator('.btn-menu.active .btn-menu-item').filter({hasText: 'Show All Chats'})).toBeVisible();
    await page.keyboard.press('Escape');

    // * built again on coming back from another folder, the list has no place for it any more
    const hasOtherFolder = await page.locator('#folders-tabs .menu-horizontal-div-item').count() > 1;
    if(hasOtherFolder) {
      await page.locator('#folders-tabs .menu-horizontal-div-item').nth(1).click();
      await expect(bar).toBeVisible();
      await page.locator('#folders-tabs .menu-horizontal-div-item').first().click();
      await expect.poll(async() => {
        const {peerIds} = await getList(page);
        return isStartOf(peerIds, await getUnreadPeerIds(page, 0)) && !peerIds.includes(read);
      }).toBe(true);
    }

    expectRowsSwappedUnseen(await recordSwitch(page, () => page.locator('.chatlist-overlay').getByRole('button', {name: 'Show All Chats'}).click()));
    await expect(bar).toBeHidden();
    await expect.poll(async() => (await getList(page)).peerIds).toContain(read);
    const list = await getList(page);
    expect(list.hasArchive).toBe(await page.evaluate(() => (window as any).appDialogsManager.xd.archiveDialogState?.hasArchiveDialog() ?? false));
  } finally {
    await setUnreadMark(page, marked, false);
    await page.evaluate(() => (window as any).appDialogsManager.setUnreadOnly(false));
  }
});
