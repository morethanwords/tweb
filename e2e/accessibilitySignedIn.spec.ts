import {expect, test} from '@playwright/test';
import {clickVisible, expectNoA11yViolations, trackBrowserErrors} from './accessibility.helpers';

/*
 * Axe over the SIGNED-IN client.
 *
 * `accessibility.spec.ts` and its siblings run against a plain unauthenticated
 * Vite server, so everything past the login screen — the chat list, a
 * conversation, the profile sidebar, settings — is never scanned at all. That
 * is most of the product, and it is also where the structural roles live: the
 * virtual chat list has exactly one user, and it only exists once a session is
 * restored.
 *
 * Like the pixel sweeps it needs an authorized preview and skips without one
 * rather than reporting a clean run it never made:
 *
 *   bash scripts/start-preview.sh --port 9105
 *   PLAYWRIGHT_BASE_URL=http://localhost:9105 pnpm exec playwright test e2e/accessibilitySignedIn.spec.ts
 */
test.describe('the signed-in client has no detectable accessibility violations', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // At 800px the chat topbar collapses its buttons away and half the
  // conversation's controls are never rendered, so this asks for a window a
  // desktop client is actually used at — the same size the pixel sweep uses.
  test.use({viewport: {width: 1280, height: 800}});

  test('every screen a session opens is clean', async({page}) => {
    test.setTimeout(20 * 60_000);
    const errors = trackBrowserErrors(page);

    /*
     * One scan, and the two things that make it trustworthy.
     *
     * It waits for the root itself with a timeout, because the helper reaches it
     * through a locator and this config sets no action timeout — a root that
     * never appears is an unbounded wait, which looks exactly like a slow scan
     * and ends as a 20-minute timeout with nothing to read.
     *
     * And it reports how many elements were under that root. Axe is happy to
     * scan nothing and call it clean; the count is what separates "no
     * violations" from "nothing was looked at".
     */
    const scan = async(what: string, include: string) => {
      await expect(page.locator(include).first(), `${what}: ${include} never appeared`)
      .toBeVisible({timeout: 30_000});
      // Counted through the page, not through the locator: a locator re-resolves
      // its element when the one it held is detached, so a root the client
      // re-creates on a timer is retried for as long as the test is allowed to
      // run. The count does not care which instance answers it.
      const nodes = await page.evaluate((sel) =>
        document.querySelector(sel)?.querySelectorAll('*').length ?? 0, include);
      expect(nodes, `${what}: ${include} is empty, a scan of it proves nothing`).toBeGreaterThan(20);
      const started = Date.now();
      await expectNoA11yViolations(page, include);
      console.log(`SCAN ${what} ${include} nodes=${nodes} ${Math.round((Date.now() - started) / 1000)}s`);
    };

    // The shared worker is the one thing a preview pane cannot load; a dedicated
    // worker runs the same code.
    //
    // Waiting for the first `.chatlist-chat` is not enough: the list is built in
    // two passes, one placeholder row and then the real ones a few seconds
    // later, and a scan that lands in between passes on an empty list. An
    // earlier version of this test did exactly that and reported it as clean.
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 5,
      null, {timeout: 180_000});
    await page.waitForTimeout(3000);

    // The virtual list holds its items directly, with no `<li>` to own, so it
    // says so. Asserting it here and not only through axe is deliberate: axe's
    // `list` rule can only fail on a list that has children, and this one is
    // empty for the first seconds of every session.
    const hosts = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#column-left .chatlist-chat'));
      return Array.from(new Set(rows.map((row) => row.parentElement))).map((el) =>
        `${el.tagName.toLowerCase()}.${el.className} role=${el.getAttribute('role')} rows=${el.children.length}`);
    });
    expect(hosts.length, 'the chat list never filled').toBeGreaterThan(0);
    for(const host of hosts) {
      expect(host, 'a populated chat list that claims to be a list without listitems').toContain('role=presentation');
    }

    await scan('chat list', '#column-left');

    // Opened from the keyboard: the row is a link and Enter follows it, which
    // is both reliable and the path a keyboard user takes. A click aimed at the
    // middle of a row can land on something that opens nothing.
    const opened = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.chatlist-chat[href]'))
      .find((el) => el.getBoundingClientRect().height > 0);
      if(!row) return false;
      row.focus();
      return document.activeElement === row;
    });
    expect(opened, 'no conversation to open').toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    await expect(page.locator('#column-center .bubble').first()).toBeVisible({timeout: 30_000});
    await scan('conversation', '#column-center');

    // The profile sidebar, reached the way a person reaches it. `clickVisible`
    // swallows a click that misses, so the sidebar being scannable is what shows
    // it opened, not the press having happened.
    //
    // This used to be unscannable: opening it put the shared-media list into a
    // self-feeding load loop that ate the main thread, and a scan through that
    // was a coin flip rather than a measurement. Fixed on master by
    // `scrollableRefiller` — see `e2e/profileSidebarIdle.spec.ts`, which holds
    // the sidebar itself to going idle.
    expect(await clickVisible(page, '.chat-info'), 'there was no chat header to press').toBe(true);
    await page.waitForTimeout(2000);
    await scan('profile', '#column-right');

    // Settings: the one screen tree behind the main menu.
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0,
      null, {timeout: 180_000});
    await clickVisible(page, '#column-left .btn-menu-toggle');
    await page.waitForTimeout(700);
    const settings = page.locator('.btn-menu.active .btn-menu-item').filter({hasText: /settings|настройк/i}).first();
    expect(await settings.isVisible().catch(() => false), 'the main menu has no settings item').toBe(true);
    await settings.click({timeout: 8000});
    await page.waitForTimeout(2500);
    await scan('settings', '.sidebar-left .sidebar-slider-item.active');

    /*
     * A Solid render failure is a gate here: it leaves a half-built DOM, and a
     * scan of that measures nothing real.
     *
     * Thrown page errors are REPORTED, not gated, and that is a deliberate
     * reversal. Gating was tried: the one crash a signed-in session had —
     * `getStarsStatus` building its `inputPeer` out of the user cache, so a cold
     * session threw on `user.access_hash` — was fixed, the gate went in, and
     * within a day an unrelated one took its place (`getTransportError` reading
     * `byteLength` of an undefined packet, from the Perfect Forward Secrecy
     * work). An accessibility suite that goes red for whatever the client
     * happens to be throwing this week reports on things it cannot fix and
     * teaches everyone to ignore it.
     *
     * So they are printed loudly instead, and a crash found this way gets its
     * own fix rather than blocking this one. What IS gated is a Solid render
     * failure: that leaves a half-built DOM, and a scan of that measures
     * nothing real.
     */
    expect(errors.renderErrors, 'the client failed to render while it was scanned').toEqual([]);
    if(errors.pageErrors.length) {
      console.log(`PAGE ERRORS ${errors.pageErrors.length}: ` +
        errors.pageErrors.map((e) => e.split('\n')[0]).join(' | '));
    }
  });
});
