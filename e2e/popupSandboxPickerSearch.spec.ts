import {expect} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * A peer picker leaves its list on screen while a new search is on its way and swaps it for the
 * results once they are in. Until then the rows it shows have to stay alive: a row torn down takes
 * back what it put on its avatar, which then drops into the text column - the row falls apart in
 * view. The search is held here, so the old list stays for as long as the test looks at it.
 */

declare global {
  interface Window {
    pickerOldRows: HTMLElement[];
    releasePickerSearch: () => void;
  }
}

test('a picker\'s rows keep their layout while a search is on its way', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'forward')).toBeNull();

  const rowsSelector = '.popup-forward .selector-list-section-content .chatlist a.row';
  await expect.poll(() => page.locator(`${rowsSelector} .row-media`).count()).toBeGreaterThan(1);

  await page.evaluate(async(rowsSelector) => {
    window.pickerOldRows = [...document.querySelectorAll<HTMLElement>(rowsSelector)];
    const path = '/src/components/popupSandbox/environment.ts';
    const {getMockManagers} = await window.e2eImport(path);
    let release: () => void;
    const held = new Promise<void>((resolve) => release = resolve);
    window.releasePickerSearch = release;
    getMockManagers().override({dialogsStorage: {
      getDialogs: () => held.then(() => ({dialogs: [] as any[], count: 0, isEnd: true}))
    }});
  }, rowsSelector);

  await page.locator('.popup-forward .input-search input').fill('zz');
  // * the picker has asked for the results: whatever it does to the old list on a new search is done
  await expect.poll(() => page.evaluate(() => window.popupSandbox.calls().some((call) => (
    call.manager === 'dialogsStorage' && call.method === 'getDialogs' && (call.args[0] as {query?: string})?.query === 'zz'
  )))).toBe(true);
  await page.waitForTimeout(100);

  const shown = () => page.evaluate(() => {
    const rows = window.pickerOldRows.filter((row) => row.isConnected);
    return {
      connected: rows.length,
      intact: rows.filter((row) => row.querySelector(':scope > .row-media')).length
    };
  });
  const whileWaiting = await shown();
  expect(whileWaiting.connected).toBeGreaterThan(1);
  expect(whileWaiting.intact).toBe(whileWaiting.connected);

  await page.evaluate(() => window.releasePickerSearch());
  await expect.poll(async() => (await shown()).connected).toBe(0);
});

test('a picker\'s search leaves no gap where the top peers were', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'forward')).toBeNull();
  await expect(page.locator('.popup-forward-top-peers .chatlist-chat').first()).toBeVisible();

  await page.locator('.popup-forward .input-search input').fill('a');
  // * the top peers fold up under the search field, and the results follow it as if they were never there
  await expect.poll(() => page.evaluate(() => {
    const selector = document.querySelector('.popup-forward .selector.active');
    const search = selector.querySelector('.selector-search-section-container').getBoundingClientRect();
    const list = selector.querySelector('.selector-list-section-container').getBoundingClientRect();
    return Math.round(list.top - search.bottom);
  })).toBe(0);
});
