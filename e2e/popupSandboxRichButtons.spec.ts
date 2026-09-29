import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {JSONContent} from '@tiptap/core';
import type {RichMediaComposerHarness} from './fixtures/richMediaComposer';

declare global {
  interface Window {
    richMediaComposerHarness: RichMediaComposerHarness
  }
}

// The complete field (RichMessageInput) with the real popups: what the keyboard does with layer
// 229's buttons and with a quote's fold switch — the keyboard layer, so `?a11y=1`.
async function open(page: Page, content: JSONContent[]) {
  await page.goto('/?popups=1&a11y=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async(content) => {
    const path = '/e2e/fixtures/richMediaComposer.ts';
    const {mountRichMediaComposerHarness} = await import(/* @vite-ignore */ path);
    window.richMediaComposerHarness = mountRichMediaComposerHarness();
    window.richMediaComposerHarness.setDocument({type: 'doc', content});
  }, content);
}

const documentOf = (page: Page) => page.evaluate(() => window.richMediaComposerHarness.state().document);

test('a button in the composer opens its box from the keyboard and gets the focus back', async({page}) => {
  await open(page, [{type: 'paragraph', content: [
    {type: 'text', text: 'Take '},
    {type: 'richButton', attrs: {action: 'copy', copyText: 'TELEGRAM', label: [{type: 'text', text: 'Copy'}]}}
  ]}]);
  const before = await documentOf(page);

  const chip = page.getByRole('button', {name: 'Copy', exact: true});
  await chip.focus();
  await page.keyboard.press('Enter');
  const box = page.locator('.popup-rich-button');
  await expect(box).toBeVisible();
  // the box starts on the button's text
  await expect(box.locator('.input-field-input').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(chip).toBeFocused();
  expect(await documentOf(page)).toEqual(before);
});

test('a long quote folds from the keyboard with its switch', async({page}) => {
  const lines = ['One', 'Two', 'Three', 'Four', 'Five'];
  await open(page, [{
    type: 'blockquote',
    attrs: {collapsed: false},
    content: lines.map((text) => ({type: 'paragraph', content: [{type: 'text', text}]}))
  }]);

  // the field measures a quote as it is typed into; a long one is then offered the fold
  await page.getByText('Five', {exact: true}).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');

  const toggle = page.getByRole('button', {name: 'Send quote collapsed'});
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.focus();
  await page.keyboard.press('Space');

  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toBeFocused();
  expect((await documentOf(page)).content?.[0].attrs).toMatchObject({collapsed: true});

  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect((await documentOf(page)).content?.[0].attrs).toMatchObject({collapsed: false});
});
