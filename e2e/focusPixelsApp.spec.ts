import {expect, test} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createSweepRecorder} from './focusPixels.helpers';
import {clickVisible} from './accessibility.helpers';

/*
 * The half of the client the popup sandbox cannot reach: the settings screens,
 * the sidebars, the menus and the conversation itself.
 *
 * It needs a signed-in client, so it runs against an authorized preview:
 *
 *   bash scripts/start-preview.sh --port 9105
 *   PLAYWRIGHT_BASE_URL=http://localhost:9105 pnpm exec playwright test e2e/focusPixelsApp.spec.ts
 *
 * Without one it skips rather than reporting a clean run it never made.
 *
 * Screens are reached by clicking, the way a person reaches them — with real
 * mouse events, not `element.click()`. The chat list opens a chat on a mouse
 * sequence, so a synthetic click selects nothing and the sweep then walks an
 * empty conversation and calls it clean.
 *
 * Importing the tab registry to open screens directly looks tidier and does not
 * work either: the module graph has cycles, and pulling it in from the console
 * throws on a half-built binding.
 */
const SLIDER = '.sidebar-left .sidebar-slider-item.active';
// A popup menu is `.active`; the context menu a right-click raises is not — it
// is placed and shown as `.contextmenu`. Both are `.btn-menu`, and the sweep
// picks whichever one is actually on screen.
const MENU = '.btn-menu.active, .btn-menu.contextmenu';
const ROWS = '.row-clickable, .row[role="button"], .row-with-icon';

test.describe('keyboard focus is visible across the signed-in client', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // The shared config is sized for the sticker tests. At 800px the chat topbar
  // collapses its buttons away and half the conversation's controls are never
  // rendered, so this suite asks for a window a desktop client is actually used
  // at.
  test.use({viewport: {width: 1280, height: 800}});

  test('every control shows visible keyboard focus', async({page}, testInfo) => {
    test.setTimeout(90 * 60_000);

    // the shared worker is the one thing a preview pane cannot load; a
    // dedicated worker runs the same code
    const reset = async() => {
      await page.goto('/?noSharedWorker=1');
      await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0,
        null, {timeout: 180_000});
      await page.waitForTimeout(2500);
    };
    await reset();

    const run = createSweepRecorder(page, testInfo, 'pixel-app-progress.json');
    const {sweep, note} = run;

    // A real mouse press, which is what the chat list and the menus listen for,
    // aimed at an element that is actually on screen. Shared with the signed-in
    // axe sweep, which needs the same two things for the same reasons.
    const click = (selector: string, opts?: {button?: 'right', last?: boolean}) =>
      clickVisible(page, selector, opts);

    /** The last bubble is the one on screen; the first may be scrolled far above. */
    const rightClickLast = (selector: string) => click(selector, {button: 'right', last: true});

    const escape = async(times = 2) => {
      for(let i = 0; i < times; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(400);
    };

    /*
     * Open something, sweep it, close it — and say so when it never opened.
     *
     * `escapes` matters inside a conversation: one Escape too many closes the
     * chat itself, and everything the sweep meant to open next is no longer
     * there to open.
     */
    const visit = async(what: string, open: () => Promise<boolean>, surface: string,
      walkKey?: 'Tab' | 'ArrowDown', settle = 1000, escapes = 2) => {
      if(!(await open())) {
        await note(`${what}: nothing to open it with`);
        return;
      }
      await page.waitForTimeout(settle);
      await sweep(what, surface, walkKey);
      await escape(escapes);
    };

    // ---------- the chat list, its search and its menus ----------
    // Tabbing through the list runs into the search field, and focusing that
    // field opens the search over the list. That is the app's own behaviour, so
    // the walk simply carries on into the search — and the list is restored by
    // reloading before the next section rather than by guessing at a way out.
    await sweep('sidebar:chatlist', '#column-left');

    // Closing the search must hand the keyboard to something. It used to drop it
    // on the document, which leaves a keyboard user with no place in the page.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1800);
    const afterEscape = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body ? 'the document body' :
        el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.');
    });
    expect(afterEscape, 'closing the sidebar search left nothing focused').not.toBe('the document body');
    await note(`closing the search leaves focus on ${afterEscape}`);

    // The chat list is virtual and drops rows it has scrolled past, the archive
    // row among them, so it is checked before anything walks the list.
    await reset();

    // Every other row in that list is a link and opens on Enter by itself; the
    // archive is a custom element with no href, so it carries the role instead.
    // It is a link and not a button on purpose — it goes somewhere, the way its
    // neighbours do — and the whole point of that choice is the second half of
    // this check: Space has to stay with the scroll, as it does on every row
    // around it, instead of opening anything.
    const archive = page.locator('archive-dialog').first();
    await archive.waitFor({state: 'attached', timeout: 15_000}).catch(() => {});
    if(await archive.count()) {
      await expect(archive).toHaveAttribute('role', 'link');

      const listScroll = () => page.evaluate(() =>
        Math.round(document.querySelector('#column-left .scrollable-y')?.scrollTop ?? -1));
      const activeTab = () => page.locator('.sidebar-left .sidebar-slider-item.active')
      .textContent().catch(() => '');

      await archive.focus();
      await expect(archive).toBeFocused();
      const before = await listScroll();
      await page.keyboard.press(' ');
      await page.waitForTimeout(1500);
      expect(await activeTab(), 'Space on the archive row opened it instead of scrolling')
      .not.toMatch(/archiv|архив/i);
      expect(await listScroll(), 'Space on the archive row scrolled nothing').not.toBe(before);

      await reset();
      await archive.waitFor({state: 'attached', timeout: 15_000}).catch(() => {});
      await archive.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
      expect(await activeTab(), 'Enter on the archive row did not open the archive')
      .toMatch(/archiv|архив/i);
      await note('the archive row opens on Enter and leaves Space to the scroll');
    } else {
      await note('archive row: this account has none');
    }

    // The rows themselves are past the search field, so they get their own walk.
    await reset();
    await sweep('sidebar:chatlist-rows', '#column-left .chatlist.virtual-chatlist');

    // A conversation's row, not the archive row above it — they are both
    // `.chatlist-chat` and their menus are different lists.
    await reset();
    await visit('menu:chat-row', () => click('a.chatlist-chat[href]', {button: 'right'}), MENU, 'ArrowDown');

    await reset();
    await visit('menu:archive-row', () => click('archive-dialog', {button: 'right'}), MENU, 'ArrowDown');

    await reset();
    await visit('menu:main', () => click('#column-left .btn-menu-toggle'), MENU, 'ArrowDown');

    // ---------- the conversation ----------
    // Opened from the keyboard: the row is a link, and Enter follows it. That is
    // both the path this sweep is about and the reliable one — a click aimed at
    // the middle of a row can land on something that does not open anything.
    await reset();
    const focusedChatRow = await page.evaluate(() => {
      // a real conversation, not the archive row that sits above them and opens
      // a folder instead
      const row = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.chatlist-chat[href]'))
      .find((el) => el.getBoundingClientRect().height > 0);
      if(!row) return false;
      row.focus();
      return document.activeElement === row;
    });
    if(focusedChatRow) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
      await sweep('chat:bubbles', '#column-center');

      await visit('menu:bubble', () => rightClickLast('.bubble:not(.is-system)'), MENU, 'ArrowDown', 1000, 1);
      await visit('sidebar:profile', () => click('.chat-info'), '#column-right', 'Tab', 2000, 1);
      await visit('chat:emoji', () => click('.toggle-emoticons'), '.emoji-dropdown', 'Tab', 2200, 1);
      await visit('menu:chat-topbar', () => click('#column-center .chat-utils .btn-menu-toggle'),
        MENU, 'ArrowDown', 1000, 1);
    } else {
      await note('chat: no row to open');
    }

    // ---------- settings, and every screen its rows open ----------
    // Rows are opened by their title, not by their position. Escaping out of a
    // screen does not always land back where it started, and an index-based
    // walk then re-enters whatever now sits at that number — which is how an
    // earlier version of this swept one screen over and over and called it
    // three.
    const openSettings = async() => {
      await click('#column-left .btn-menu-toggle');
      await page.waitForTimeout(700);
      const item = page.locator('.btn-menu.active .btn-menu-item')
      .filter({hasText: /settings|настройк/i}).first();
      if(!(await item.isVisible().catch(() => false))) return false;
      await item.click({timeout: 8000}).catch(() => {});
      await page.waitForTimeout(2000);
      return true;
    };

    const rowTitles = () => page.evaluate(({sel, rows}) =>
      Array.from(document.querySelectorAll<HTMLElement>(`${sel} :is(${rows})`))
      .map((row) => row.querySelector('.row-title')?.textContent?.trim())
      .filter((title): title is string => !!title && title.length < 40),
    {sel: SLIDER, rows: ROWS});

    const openByTitle = async(label: string) => {
      const row = page.locator(`${SLIDER} :is(${ROWS})`)
      .filter({has: page.locator('.row-title', {hasText: label})}).first();
      if(!(await row.isVisible().catch(() => false))) return false;
      await row.scrollIntoViewIfNeeded().catch(() => {});
      await row.click({timeout: 8000}).catch(() => {});
      await page.waitForTimeout(1500);
      return true;
    };

    await reset();
    if(!(await openSettings())) {
      await note('settings: could not be opened from the menu');
    } else {
      await sweep('settings:root', SLIDER);
      const roots = await rowTitles();
      await note(`settings has ${roots.length} rows on its first screen`);

      for(const label of roots) {
        await reset();
        if(!(await openSettings()) || !(await openByTitle(label))) {
          await note(`settings/${label}: could not be reached`);
          continue;
        }
        if(!(await sweep('settings:' + label, SLIDER))) continue;

        // and one level further in, from the screen that is open right now
        const children = (await rowTitles()).filter((child) => child !== label).slice(0, 8);
        for(const child of children) {
          if(!(await openByTitle(child))) continue;
          await sweep(`settings:${label}/${child}`, SLIDER);
          await escape(2);
          // back out to the parent, whatever depth that took
          if(!(await rowTitles()).includes(child)) {
            await escape(2);
            if(!(await openSettings()) || !(await openByTitle(label))) break;
          }
        }
      }
    }

    await testInfo.attach('focus-pixels-app.json', {
      body: JSON.stringify({walked: run.walked, totalStops: run.total(), findings: run.findings, notes: run.notes}, null, 2),
      contentType: 'application/json'
    });

    console.log('APPSWEEP stops=' + run.total() + ' surfaces=' + Object.keys(run.walked).length +
      ' findings=' + run.findings.length);

    // a sweep that reached almost nothing must not read as a clean one
    expect(run.total(), 'the sweep barely walked anything — the client never came up properly')
    .toBeGreaterThan(60);

    expect(run.findings, run.summary()).toEqual([]);
  });
});
