import {expect, Page} from '@playwright/test';
import {test} from './workerContext';
import {closeStory, openStory, popupSettled, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * The translation of a message of a chat that forbids copying shows its text and the translated one with
 * nothing to copy them by, as tdesktop's TranslateBox does: no copy button, and a selection that takes
 * either text in - of the text alone, or Select All's whole page, whose copy the document gets - is refused
 * when copied, with the toast the chat's bubbles give. A message that can be copied keeps both.
 */

const TRANSLATION = 'Переведённый текст';

/** copies what is selected; whether the copy went through */
function copySelection(page: Page) {
  return page.evaluate(() => {
    let went: boolean;
    const onCopy = (e: ClipboardEvent) => went = !e.defaultPrevented;
    window.addEventListener('copy', onCopy, {once: true});
    document.execCommand('copy');
    window.removeEventListener('copy', onCopy);
    // * a copy refused before it reaches the window did not go either
    return !!went;
  });
}

/**
 * The popup's copy buttons, and whether copying went through: a selection of each of its texts, then all
 * of the page selected from the first of them
 */
async function readCopying(page: Page) {
  const popup = page.locator('.popup.active');
  await expect(popup).toContainText(TRANSLATION);
  // * the translation fades in
  await popupSettled(page, '.popup.active');

  const texts = popup.locator('[class*="_richTextScrollableContent_"]');
  await expect(texts).toHaveCount(2);
  const copied: boolean[] = [];
  for(const text of await texts.all()) {
    await text.click({clickCount: 3});
    copied.push(await copySelection(page));
  }

  await texts.first().click();
  await page.keyboard.press('ControlOrMeta+A');
  expect(await page.evaluate(() => getSelection().toString()), 'Select All did not take the popup\'s text in').toContain(TRANSLATION);
  copied.push(await copySelection(page));

  return {
    copyButtons: await popup.locator('[class*="_copyButton_"]').count(),
    copied
  };
}

test('a translation offers its text to be copied, and of a message that forbids copying it does not', async({page}) => {
  await preparePopupSandbox(page, false);

  expect(await openStory(page, 'translate')).toBeNull();
  const free = await readCopying(page);
  expect(free.copyButtons, 'the copy button is gone from a message that can be copied').toBe(1);
  expect(free.copied, 'a text of a message that can be copied could not be copied').toEqual([true, true, true]);
  expect(await closeStory(page, {})).toBe(true);

  expect(await openStory(page, 'translate/noForwards')).toBeNull();
  const kept = await readCopying(page);
  expect(kept.copyButtons, 'the translation of a protected message can be copied by its button').toBe(0);
  expect(kept.copied, 'a text of a protected message could be copied').toEqual([false, false, false]);
  await expect(page.getByText('Copying is restricted in this chat.'), 'nothing said why the copy was refused').toBeVisible();
});
