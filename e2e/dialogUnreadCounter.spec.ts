import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * The unread badge of a chat-list row rolls its count when it changes, as the official apps do:
 * the characters that change slide out and in - up for a count that grows, down for one that
 * shrinks - and the badge widens or narrows with them (`setRollingText`). Only while it moves:
 * a badge that comes in brings its count with it, and once the roll is over the badge holds the
 * plain text again.
 *
 * So do the other unread counters a count can change on in sight - the go-down button of the open
 * chat, the folder tabs above the list - through the very updates that change them.
 *
 * A badge that goes leaves from where it stands, out of the row's flow: the message takes its room as
 * it starts going and comes out from under it, rather than widening in one step once it is gone.
 *
 * The counts are rendered locally only: the row is handed a copy of its dialog with the counters
 * it is meant to show, or the update pipeline a read-history update the server could have sent,
 * marking nothing read; nothing is sent anywhere, and the count the chat had is put back after.
 *
 * It needs a signed-in account, so like the other signed-in specs it runs against an authorized
 * preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/dialogUnreadCounter.spec.ts
 */

const READ = {
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  unread_poll_votes_count: 0
};

type Frame = {
  width: number,
  /** what the badge holds while it stands still - null while its count rolls */
  text: string,
  rows: {text: string, opacity: number, y: number}[]
};

/**
 * The rows of the main list that are in sight, up to `max` - with `cutShort`, only those whose
 * message is cut short and has nothing at its end
 */
function findRows(page: Page, max: number, cutShort?: boolean) {
  return page.evaluate(({max, cutShort}) => {
    const w = window as any;
    const rows = Array.from(document.querySelectorAll<HTMLElement>('#column-left .chatlist-chat[data-peer-id]')).filter((row) => {
      const rect = row.getBoundingClientRect();
      const dialogElement = w.appDialogsManager.xd.getDialogElement(+row.dataset.peerId);
      if(rect.top < 0 || rect.bottom > innerHeight || !dialogElement?.isMainList) return false;
      const subtitle: HTMLElement = dialogElement.subtitle;
      return !cutShort || (
        dialogElement.dom.listEl === row &&
        subtitle.scrollWidth > subtitle.clientWidth + 20 &&
        !row.querySelector('.dialog-subtitle-badge.is-visible')
      );
    });
    return rows.slice(0, max).map((row) => +row.dataset.peerId);
  }, {max, cutShort});
}

/** a row of the main list that is in sight */
async function findRow(page: Page) {
  return (await findRows(page, 1))[0];
}

/** the layouts the page has run so far - Chrome's count of them */
async function layoutCounter(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return async() => (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'LayoutCount').value;
}

/**
 * What a burst of updates does to the list: the unread badge of every row set in one task, and the
 * mention's beside it. Reports how many of the counts roll
 */
function setUnreadBadges(page: Page, peerIds: number[], state: {
  unread: boolean,
  count: number,
  mentions?: boolean,
  /**
   * each row written to before its badges are set, as an update does (`setLastMessage` puts its time
   * in): a read of the layout among the badges' has it laid out again then
   */
  written?: boolean
}) {
  return page.evaluate(({peerIds, unread, count, mentions, written}) => {
    const w = window as any;
    for(const peerId of peerIds) {
      const dialogElement = w.appDialogsManager.xd.getDialogElement(peerId);
      if(written) {
        const time: HTMLElement = dialogElement.dom.lastTimeSpan;
        time.textContent = time.textContent;
      }

      dialogElement.setBadgeState({
        muted: false,
        pinned: false,
        unread,
        unreadText: '' + count,
        unreadCount: count,
        unreadMention: false,
        unreadAvatar: false,
        mentions: !!mentions,
        reactions: false,
        pollVotes: false,
        transitionDuration: 250
      });
    }

    return Array.from(document.querySelectorAll('#column-left .dialog-subtitle-badge-unread .animated-counter')).length;
  }, {peerIds, ...state});
}

/**
 * Renders the row with its dialog patched (or as it really is, with no patch), and reports what
 * its unread badge looked like on every frame of the transition that follows
 */
function renderDialog(page: Page, peerId: number, patch?: Record<string, any>, isBatch?: boolean) {
  return page.evaluate(async({peerId, patch, isBatch}) => {
    const w = window as any;
    const row = document.querySelector(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`);
    const frames: Frame[] = [];
    const snapshot = () => {
      const badge = row.querySelector<HTMLElement>('.dialog-subtitle-badge-unread');
      if(!badge) return;
      frames.push({
        width: badge.getBoundingClientRect().width,
        text: badge.querySelector('.animated-counter') ? null : badge.textContent,
        rows: Array.from(badge.querySelectorAll<HTMLElement>('.animated-super-row'), (element) => {
          const style = getComputedStyle(element);
          return {text: element.textContent, opacity: +style.opacity, y: new DOMMatrix(style.transform).m42};
        })
      });
    };

    const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
    const dialogElement = w.appDialogsManager.xd.getDialogElement(peerId);
    const start = performance.now();
    await w.appDialogsManager.setUnreadMessagesN({
      dialog: patch ? {...dialog, ...patch, pFlags: {...dialog.pFlags, unread_mark: undefined, ...patch.pFlags}} : dialog,
      dialogElement,
      isBatch
    });

    // * well past the roll, and past the badge settling back to its text
    return new Promise<Frame[]>((resolve) => {
      const tick = () => {
        snapshot();
        if(performance.now() - start < 600) requestAnimationFrame(tick);
        else resolve(frames);
      };
      tick();
    });
  }, {peerId, patch, isBatch});
}

/** the badge never held anything but its plain text */
function expectStill(frames: Frame[], text: string) {
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.map((frame) => frame.text), 'the count rolled').toEqual(frames.map(() => text));
}

/** it rolled, and settled on `text` - the plain text, as wide as the roll left it */
function expectRolled(frames: Frame[], text: string) {
  const rolling = frames.filter((frame) => frame.text === null);
  expect(rolling.length, 'the count did not roll').toBeGreaterThan(0);
  const last = frames[frames.length - 1];
  expect(last.text).toBe(text);
  expect(Math.abs(last.width - frames[frames.indexOf(rolling[rolling.length - 1])].width), 'the badge jumped as it settled').toBeLessThanOrEqual(0.5);
  return rolling;
}

/** some frame had `leaving` on its way out and `coming` on its way in, each on its own side */
function hasPassing(frames: Frame[], leaving: string, coming: string, up: boolean) {
  const sign = up ? 1 : -1;
  return frames.some((frame) => {
    return frame.rows.some((row) => row.text === leaving && row.y * sign < -2) &&
      frame.rows.some((row) => row.text === coming && row.y * sign > 2);
  });
}

test.describe('the unread count of a chat-list row', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // the chat list is a column beside the conversation only on a desktop-sized window
  test.use({viewport: {width: 1280, height: 800}});

  let peerId: number;
  test.beforeEach(async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    test.skip(
      !await page.evaluate(() => document.body.classList.contains('animation-level-2')),
      'animations are off in this client'
    );

    peerId = await findRow(page);
    test.skip(!peerId, 'no row in sight');
    await page.locator(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`).scrollIntoViewIfNeeded();
  });

  test.afterEach(async({page}) => {
    // * whatever the account really has
    if(peerId) await renderDialog(page, peerId).catch(() => {});
  });

  test('rolls to a new count, up as it grows and down as it shrinks', async({page}) => {
    await renderDialog(page, peerId, READ);
    // * a badge that comes in brings its count with it
    expectStill(await renderDialog(page, peerId, {...READ, unread_count: 9}), '9');

    const up = expectRolled(await renderDialog(page, peerId, {...READ, unread_count: 10}), '10');
    expect(hasPassing(up, '9', '1', true), '9 → 10 did not roll up').toBe(true);
    const widening = up.map((frame) => frame.width);
    expect(widening.every((width, i) => !i || width >= widening[i - 1] - 0.5), 'the badge did not widen steadily').toBe(true);
    expect(widening[widening.length - 1] - widening[0]).toBeGreaterThan(4);

    const down = expectRolled(await renderDialog(page, peerId, {...READ, unread_count: 9}), '9');
    expect(hasPassing(down, '1', '9', false), '10 → 9 did not roll down').toBe(true);
    const narrowing = down.map((frame) => frame.width);
    expect(narrowing.every((width, i) => !i || width <= narrowing[i - 1] + 0.5), 'the badge did not narrow steadily').toBe(true);

    // * only the characters that change, and the shortened count of a large one is no exception
    await renderDialog(page, peerId, {...READ, unread_count: 12});
    const one = expectRolled(await renderDialog(page, peerId, {...READ, unread_count: 13}), '13');
    expect(hasPassing(one, '2', '3', true)).toBe(true);
    expect(one.every((frame) => frame.rows.some((row) => row.text === '1' && row.opacity === 1 && row.y === 0)), 'the 1 of 12 → 13 moved').toBe(true);

    await renderDialog(page, peerId, {...READ, unread_count: 999});
    expect(hasPassing(expectRolled(await renderDialog(page, peerId, {...READ, unread_count: 1000}), '1K'), '9', 'K', true)).toBe(true);
  });

  test('keeps to the width of its count in a list that has a `--width` of its own, as the topics column does', async({page}) => {
    await renderDialog(page, peerId, {...READ, unread_count: 9});
    const setListWidth = (width?: string) => page.evaluate((width) => {
      const list = document.querySelector<HTMLElement>('#column-left');
      if(width) list.style.setProperty('--width', width);
      else list.style.removeProperty('--width');
    }, width);

    await setListWidth('100%');
    try {
      const rolling = expectRolled(await renderDialog(page, peerId, {...READ, unread_count: 10}), '10');
      expect(Math.max(...rolling.map((frame) => frame.width)), 'the badge took the width of the list').toBeLessThanOrEqual(rolling[rolling.length - 1].width + 0.5);
    } finally {
      await setListWidth();
    }
  });

  test('stays put where it should not roll', async({page}) => {
    await renderDialog(page, peerId, {...READ, unread_count: 9});
    // * the rows rendered in a batch, as the list does when it loads them
    expectStill(await renderDialog(page, peerId, {...READ, unread_count: 10}, true), '10');

    // * the `@` of a single unread mention has a badge cut otherwise, and only swaps with a number
    expectStill(await renderDialog(page, peerId, {...READ, unread_count: 1, unread_mentions_count: 1}), '@');
    const swapped = await renderDialog(page, peerId, {...READ, unread_count: 2, unread_mentions_count: 1});
    expectStill(swapped, '2');
    expect(Math.max(...swapped.map((frame) => frame.width)), 'the badge swelled').toBeLessThanOrEqual(swapped[swapped.length - 1].width + 0.5);
  });

  test('reads as the count while it rolls - to a screen reader, and to the avatar badge of a narrow list', async({page}) => {
    await renderDialog(page, peerId, {...READ, unread_count: 9});
    const {rolling, hidden, label, avatar} = await page.evaluate(async(peerId) => {
      const w = window as any;
      const row = document.querySelector(`#column-left .chatlist-chat[data-peer-id="${peerId}"]`);
      const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
      await w.appDialogsManager.setUnreadMessagesN({
        dialog: {...dialog, unread_count: 10, unread_mentions_count: 0, unread_reactions_count: 0, unread_poll_votes_count: 0, pFlags: {...dialog.pFlags, unread_mark: undefined}},
        dialogElement: w.appDialogsManager.xd.getDialogElement(peerId)
      });

      // * what the list does to every row as it narrows (`AppSidebarLeft.onCollapsedChange`)
      w.appDialogsManager.xd.toggleAvatarUnreadBadges(true, 0);
      const counter = row.querySelector('.dialog-subtitle-badge-unread .animated-counter');
      const result = {
        rolling: !!counter,
        // * the counter holds every character twice, and the old ones on their way out
        hidden: counter?.getAttribute('aria-hidden'),
        label: row.querySelector('.dialog-subtitle-badge-unread .sr-only')?.textContent,
        avatar: row.querySelector('.avatar-badge')?.textContent
      };
      w.appDialogsManager.xd.toggleAvatarUnreadBadges(false, 0);
      return result;
    }, peerId);

    expect(rolling, 'the count was not rolling - nothing to read it from').toBe(true);
    expect(hidden).toBe('true');
    expect(label).toBe('10');
    expect(avatar).toBe('10');
  });

  test('reads no layout while the counts of many rows change at once', async({page}) => {
    // * the rows in sight, as many as there are of them up to 8
    const peerIds = await findRows(page, 8);
    const setCounts = (count: number) => setUnreadBadges(page, peerIds, {unread: true, count});
    const layouts = await layoutCounter(page);

    try {
      await setCounts(9);
      await page.waitForTimeout(600);

      const before = await layouts();
      const rolling = await setCounts(10);
      // * a frame may have rendered the change before the count is read
      expect(await layouts() - before, 'the rolls read the layout as they were set').toBeLessThanOrEqual(2);
      expect(rolling, 'the counts did not roll').toBe(peerIds.length);
    } finally {
      for(const peerId of peerIds) {
        await renderDialog(page, peerId).catch(() => {});
      }
    }
  });

  test('gives its room to the message as it starts going, from where it stood', async({page}) => {
    const [longPeerId] = await findRows(page, 1, true);
    test.skip(!longPeerId, 'no row in sight with a message cut short');

    try {
      await renderDialog(page, longPeerId, {...READ, unread_count: 3});
      const frames = await page.evaluate(async({peerId, read}) => {
        const w = window as any;
        const dialogElement = () => w.appDialogsManager.xd.getDialogElement(peerId);
        const badge: HTMLElement = dialogElement().dom.unreadBadge;
        const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
        const frames: {message: number, at: number, scale: number}[] = [];
        const snapshot = () => frames.push({
          message: dialogElement().subtitle.getBoundingClientRect().width,
          // * where the badge stands, untransformed, and how much of it is left
          at: badge.isConnected ? badge.offsetLeft : null,
          scale: badge.isConnected ? new DOMMatrix(getComputedStyle(badge).transform).a : 0
        });

        snapshot();
        await w.appDialogsManager.setUnreadMessagesN({
          dialog: {...dialog, ...read, pFlags: {...dialog.pFlags, unread_mark: undefined}},
          dialogElement: dialogElement()
        });
        const start = performance.now();
        return new Promise<typeof frames>((resolve) => {
          const tick = () => {
            snapshot();
            if(performance.now() - start < 600) requestAnimationFrame(tick);
            else resolve(frames);
          };
          requestAnimationFrame(tick);
        });
      }, {peerId: longPeerId, read: READ});

      const final = frames[frames.length - 1].message;
      expect(final, 'the message did not take the room').toBeGreaterThan(frames[0].message + 10);
      const taken = frames.findIndex((frame) => Math.abs(frame.message - final) <= 0.5);
      expect(frames[taken].scale, 'the message took the room only once the badge was gone').toBeGreaterThanOrEqual(0.8);
      expect(frames.slice(taken).every((frame) => Math.abs(frame.message - final) <= 0.5), 'the message widened in steps').toBe(true);
      expect(frames.filter((frame) => frame.at !== null).every((frame) => Math.abs(frame.at - frames[0].at) <= 0.5), 'the badge moved as it left').toBe(true);
    } finally {
      await renderDialog(page, longPeerId).catch(() => {});
    }
  });

  test('lets go of the badges of many rows at once, or of some for others, with no more layout than of one', async({page}) => {
    const peerIds = await findRows(page, 8);
    test.skip(peerIds.length < 4, 'too few rows in sight');
    const layouts = await layoutCounter(page);

    // * a folder read at once lets go of the badges of its rows in one task - or of the counts, for
    // * the mentions left (`withMention`), which come in as they go; the frames after are waited out,
    // * the one their places are read in among them
    const letGo = async(peerIds: number[], withMention?: boolean) => {
      await setUnreadBadges(page, peerIds, {unread: true, count: 3});
      await page.waitForTimeout(600);
      const before = await layouts();
      await setUnreadBadges(page, peerIds, {unread: false, count: 3, mentions: withMention, written: true});
      await page.evaluate(async() => {
        for(let i = 0; i < 3; ++i) {
          await new Promise(requestAnimationFrame);
        }
      });
      return await layouts() - before;
    };

    try {
      // * once unmeasured: the rows leave what they really show (a pin, a bot's button) on the first
      await letGo(peerIds);

      const costs = [];
      for(const withMention of [false, true]) {
        const one = await letGo(peerIds.slice(0, 1), withMention);
        const many = await letGo(peerIds, withMention);
        costs.push({withMention, one, many, extra: many - one});
      }

      expect(
        Math.max(...costs.map(({extra}) => extra)),
        `each row read the layout as its badge left (${peerIds.length} rows): ${JSON.stringify(costs)}`
      ).toBeLessThanOrEqual(2);
    } finally {
      for(const peerId of peerIds) {
        await renderDialog(page, peerId).catch(() => {});
      }
    }
  });
});

type BadgeState = {
  /** shown, at all */
  shown: boolean,
  rolling: boolean,
  /** what it says - while it rolls, what it rolls to */
  text: string
};

/**
 * Sets the unread count of a user's chat the way the server does - a read-history update with the
 * read position as it is, marking nothing read - and reports the badges it shows on every frame
 * after: the go-down button of the open chat, the chat's row, every folder tab
 */
function setUnreadCount(page: Page, peerId: number, count: number) {
  return page.evaluate(async({peerId, count}) => {
    const w = window as any;
    const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
    const state = (badge: HTMLElement): BadgeState => ({
      shown: !!badge && !badge.classList.contains('is-badge-empty'),
      rolling: !!badge?.querySelector('.animated-counter'),
      text: badge?.querySelector('.sr-only')?.textContent ?? badge?.textContent ?? ''
    });

    const frames: {goDown: BadgeState, row: BadgeState, tabs: BadgeState[]}[] = [];
    const snapshot = () => frames.push({
      goDown: state(w.appImManager.chat.input.goDownUnreadBadge),
      row: state(document.querySelector(`#column-left .chatlist-chat[data-peer-id="${peerId}"] .dialog-subtitle-badge-unread`)),
      tabs: Array.from(document.querySelectorAll<HTMLElement>('#folders-tabs .badge'), state)
    });

    snapshot();
    w.rootScope.managers.apiUpdatesManager.processLocalUpdate({
      _: 'updateReadHistoryInbox',
      peer: {_: 'peerUser', user_id: peerId},
      max_id: dialog.read_inbox_max_id,
      still_unread_count: count
    });

    const start = performance.now();
    return new Promise<typeof frames>((resolve) => {
      const tick = () => {
        snapshot();
        if(performance.now() - start < 900) requestAnimationFrame(tick);
        else resolve(frames);
      };
      tick();
    });
  }, {peerId, count});
}

test.describe('the unread counters of a chat', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('roll on the go-down button, the chat-list row and the folder tabs as the chat is read or written to', async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    test.skip(
      !await page.evaluate(() => document.body.classList.contains('animation-level-2')),
      'animations are off in this client'
    );

    // * a user's chat with nothing unread, and history enough to scroll away from its end
    const peerId = await page.evaluate(async() => {
      const w = window as any;
      for(const row of Array.from(document.querySelectorAll<HTMLElement>('#column-left .chatlist-chat[data-peer-id]'))) {
        const peerId = +row.dataset.peerId;
        const user = peerId > 0 && w.apiManagerProxy.getUser(peerId);
        if(!user || user.pFlags.self || user.pFlags.support) continue;
        const dialog = await w.rootScope.managers.appMessagesManager.getDialogOnly(peerId);
        if(dialog && !dialog.unread_count && dialog.top_message > 30) {
          row.scrollIntoView({block: 'center'});
          await w.appImManager.setInnerPeer({peerId});
          return peerId;
        }
      }
    });
    test.skip(!peerId, 'no user\'s chat with nothing unread in the chat list of this account');

    await page.waitForFunction((peerId) => {
      const chat = (window as any).appImManager.chat;
      return chat?.peerId === peerId && chat.bubbles.scrollable.container.querySelector('.bubble');
    }, peerId);
    // * away from the end of the chat, where the go-down button shows
    await page.evaluate(() => (window as any).appImManager.chat.bubbles.scrollable.container.scrollTop = 0);
    await expect(page.locator('.chat.active .bubbles-go-down')).toBeVisible();

    try {
      // * the chat getting unread changes how many unread chats the folders it is in hold
      const written = await setUnreadCount(page, peerId, 9);
      const [first, last] = [written[0], written[written.length - 1]];
      expect(last.goDown).toEqual({shown: true, rolling: false, text: '9'});
      expect(last.row).toEqual({shown: true, rolling: false, text: '9'});
      // * a badge that comes in brings its count with it
      expect(written.some((frame) => frame.goDown.rolling || frame.row.rolling), 'a count rolled in with its badge').toBe(false);
      const rolledTabs = first.tabs.map((tab, i) => tab.shown && last.tabs[i].shown && tab.text !== last.tabs[i].text ? i : -1).filter((i) => i !== -1);
      for(const i of rolledTabs) {
        expect(written.some((frame) => frame.tabs[i].rolling), `the count of folder tab ${i} did not roll`).toBe(true);
      }

      const more = await setUnreadCount(page, peerId, 10);
      expect(more.some((frame) => frame.goDown.rolling), 'the go-down button did not roll').toBe(true);
      expect(more.some((frame) => frame.row.rolling), 'the row did not roll').toBe(true);
      expect(more[more.length - 1].goDown).toEqual({shown: true, rolling: false, text: '10'});
      expect(more[more.length - 1].row).toEqual({shown: true, rolling: false, text: '10'});
    } finally {
      // * what the chat really had
      await setUnreadCount(page, peerId, 0).catch(() => {});
    }
  });
});
