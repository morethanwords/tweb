import {expect, Page, test} from '@playwright/test';

/*
 * A private chat picks its theme the way tdesktop does it: "Set Wallpaper" in the chat's menu puts
 * a "Select theme" panel where the composer was, a tile previews its theme on the chat itself, and
 * leaving with Escape brings back the composer and the chat's own background. Pointed at the theme
 * the chat has, the panel's button opens the chat's own wallpapers, and a wallpaper is previewed
 * before it is applied. Nothing is applied, so the account is left as it was.
 *
 * It needs a signed-in client, so like the other signed-in specs it runs against an authorized
 * preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:theme:app
 */
test.describe('the chat theme picker', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('previews a theme in place of the composer and puts the chat back on Escape', async({page}) => {
    test.setTimeout(5 * 60_000);

    // The shared worker is the one thing a preview pane cannot load; a dedicated worker runs the
    // same code.
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0,
      null, {timeout: 180_000});

    // * Saved Messages: a private chat every account has, and nobody else sees
    await page.evaluate(() => (window as any).appImManager.setInnerPeer({peerId: (window as any).rootScope.myId}));
    // * the chat may have nothing in it, so it is waited for as an open chat, not by its bubbles
    await page.waitForFunction(() => {
      const {appImManager, rootScope} = window as any;
      return appImManager.chat?.peerId === rootScope.myId && !!appImManager.chat.fullPeer?.();
    }, null, {timeout: 60_000});

    const ownTheme = await currentTheme(page);
    const composer = page.locator('#column-center .chat.active .chat-input-main-container');
    await expect(composer).toBeVisible();

    await page.locator('#column-center .chat.active .chat-utils .btn-menu-toggle').last().click();
    await page.getByRole('menuitem', {name: 'Set Wallpaper'}).click();

    const panel = page.getByRole('region', {name: 'Select theme'});
    await expect(panel).toBeVisible();
    await expect(composer).toBeHidden();

    const tiles = panel.locator('.theme-container');
    await expect(tiles.first()).toHaveAttribute('aria-label', 'No Theme');
    await expect.poll(() => tiles.count(), {timeout: 30_000}).toBeGreaterThan(2);

    // * pointed at the chat's own theme, the panel offers a wallpaper for it instead of applying
    await expect(panel.getByRole('button', {name: 'Change Wallpaper'})).toBeVisible();
    const apply = panel.getByRole('button', {name: 'Apply Theme'});
    await expect(apply).toBeHidden();

    // * a tile that is not the chat's theme now, held by its name: once picked it is the active one
    const tileName = await panel.locator('.theme-container:not(.active)').nth(1).getAttribute('aria-label');
    const tile = panel.locator(`.theme-container[aria-label="${tileName}"]`);
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => currentTheme(page), {timeout: 10_000}).not.toBe(ownTheme);
    await expect(apply).toBeVisible();
    console.log(`theme picker: "${ownTheme}" → previewing "${tileName}"`);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(composer).toBeVisible();
    await expect.poll(() => currentTheme(page), {timeout: 10_000}).toBe(ownTheme);

    // * pointed back at the chat's own theme, the button picks a wallpaper for the chat instead
    await page.locator('#column-center .chat.active .chat-utils .btn-menu-toggle').last().click();
    await page.getByRole('menuitem', {name: 'Set Wallpaper'}).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', {name: 'Change Wallpaper'}).click();

    const picker = page.getByRole('dialog', {name: 'Chat Wallpaper'});
    await expect(picker).toBeVisible();
    const wallPapers = picker.locator('.grid-item');
    // * the one that drops the chat's own comes first, and one of them is marked as in use
    await expect(wallPapers.first()).toHaveAttribute('aria-label', 'Reset');
    await expect.poll(() => wallPapers.count(), {timeout: 30_000}).toBeGreaterThan(2);
    await expect(picker.locator('.grid-item.active')).toHaveCount(1);

    await picker.locator('.grid-item:not(.active)').nth(1).click();
    const preview = page.getByRole('dialog', {name: 'Wallpaper Preview'});
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('button', {name: 'Apply For This Chat'})).toBeVisible();

    // * nothing applied: each Escape takes one step back, the panel last
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect.poll(() => currentTheme(page), {timeout: 10_000}).toBe(ownTheme);
  });
});

/** What the chat is drawn with: its theme's name, emoticon, or none. */
function currentTheme(page: Page) {
  return page.evaluate(() => {
    const theme = (window as any).appImManager?.chat?.currentTheme;
    return theme ? String(theme.emoticon || theme.title || theme.id) : 'none';
  });
}
