import {expect} from '@playwright/test';
import {test} from './workerContext';
import {closeStory, openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * A file of no bytes cannot be sent: nothing of it can be uploaded, and its upload never ended - the message spun
 * for good. Attached among others, it is left out and named in a toast, as tdesktop does ("File: … is empty and
 * can't be sent."); the others go on to the popup.
 */
test('an empty file attached is left out, and said to be', async({page}) => {
  await preparePopupSandbox(page, false);
  expect(await openStory(page, 'newMedia/empty')).toBeNull();
  await expect(page.locator('.popup.active')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('empty.txt');
  // * the photo alone: with the empty file it would be "Send 2 Files"
  await expect(page.locator('.popup.active .popup-title')).toHaveText('Send Photo');
  await closeStory(page, {surface: undefined});
});
