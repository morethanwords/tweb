import {expect, test} from '@playwright/test';
import {recordModules, rerunLoadedModules} from './hotRerun.helpers';

/*
 * popupSandboxHotRerun.spec.ts past the sign-in: the chat list, a conversation, the sidebars - every module a signed-in
 * boot loads, run once more with its code unchanged, as a hot update runs it, must keep the page. It needs a signed-in
 * client, so like the other signed-in specs it runs against an authorized preview and skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:hot:app
 */
test.describe('a hot re-run of the signed-in client', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test('keeps the page for every module run again with its code unchanged', async({page}) => {
    test.setTimeout(5 * 60_000);
    await recordModules(page);
    // the shared worker is the one thing a preview pane cannot load; a dedicated worker runs the same code
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});

    const result = await rerunLoadedModules(page);
    expect(result.modules).toBeGreaterThan(1000);
    expect(result.errors).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });
});
