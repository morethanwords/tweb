import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import path from 'node:path';
import type {RichMediaComposerHarness} from './fixtures/richMediaComposer';

declare global {
  interface Window {
    richMediaComposerHarness: RichMediaComposerHarness,
    secondRichMediaComposerHarness: RichMediaComposerHarness
  }
}

const photoPath = path.resolve('public/assets/img/camomile.jpg');

async function open(page: Page) {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async() => {
    const path = '/e2e/fixtures/richMediaComposer.ts';
    const {mountRichMediaComposerHarness} = await import(/* @vite-ignore */ path);
    window.richMediaComposerHarness = mountRichMediaComposerHarness();
  });
}

async function pick(page: Page, button: string) {
  if(button !== 'Choose media') await page.locator('.chat-input-rich-media-preview').hover();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: button, exact: true}).click();
  await (await chooser).setFiles(photoPath);
}

test('native media controls insert, add and replace through the standalone field', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  for(const [index, button] of ['Choose media', 'Add media', 'Replace media'].entries()) {
    await pick(page, button);
    await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(index + 1);
    await expect(page.locator('[data-upload-id]')).toHaveCount(1);
    await page.evaluate(index => window.richMediaComposerHarness.finish(index), index);
    await expect(page.locator('[data-upload-id]')).toHaveCount(0);
    await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).tasks).toBe(0);
    const state = await page.evaluate(() => window.richMediaComposerHarness.state());
    expect(state.document.content?.[0].type).toBe('richMedia');
    const block = state.document.content?.[0].attrs?.block;
    expect(block._).toBe(index === 0 ? 'pageBlockPhoto' : 'pageBlockCollage');
    if(index) expect(block.items).toHaveLength(2);
    expect(state.sends).toBe(0);
  }
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
  expect(errors).toEqual([]);
});

test('standalone field owns its toolbar, table history, expansion and math popup', async({page}) => {
  await open(page);
  const field = page.locator('.rich-message-input');
  await expect(field.locator('.message-input-editor-toolbar-bottom')).toBeVisible();
  await field.getByRole('button', {name: 'Insert table', exact: true}).click();
  await expect(field.locator('table')).toHaveCount(1);
  await field.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(field.locator('table')).toHaveCount(0);
  await field.getByRole('button', {name: 'Redo', exact: true}).click();
  await expect(field.locator('table')).toHaveCount(1);
  await page.evaluate(() => window.richMediaComposerHarness.setText('Formula '));
  await field.getByRole('button', {name: 'Math formula', exact: true}).click();
  await page.locator('.popup-rich-math .input-field-input').fill('x^2');
  await page.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(field.locator('[data-inline-math]')).toHaveCount(1);
  await page.evaluate(() => window.richMediaComposerHarness.setExpanded(false));
  await expect(field.locator('.message-input-editor-toolbar-bottom')).toBeHidden();
  await page.evaluate(() => window.richMediaComposerHarness.setExpanded(true));
  await expect(field.locator('.message-input-editor-toolbar-bottom')).toBeVisible();
  await expect(field.locator('[data-inline-math]')).toHaveCount(1);
});

test('two standalone fields keep independent documents and disposal', async({page}) => {
  await open(page);
  await page.evaluate(async() => {
    window.richMediaComposerHarness.setText('First');
    const path = '/e2e/fixtures/richMediaComposer.ts';
    const {mountRichMediaComposerHarness} = await import(/* @vite-ignore */ path);
    window.secondRichMediaComposerHarness = mountRichMediaComposerHarness();
    window.secondRichMediaComposerHarness.setText('Second');
  });
  await expect(page.locator('.rich-message-input')).toHaveCount(2);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
  const remaining = page.locator('.rich-message-input');
  await expect(remaining).toHaveCount(1);
  await expect(remaining.locator('.input-message-input')).toContainText('Second');
  await remaining.getByRole('button', {name: 'Insert table', exact: true}).click();
  await expect(remaining.locator('table')).toHaveCount(1);
  await remaining.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(remaining.locator('.input-message-input')).toContainText('Second');
  await expect(remaining.locator('table')).toHaveCount(0);
  await page.evaluate(() => window.secondRichMediaComposerHarness.destroy());
  await expect(page.locator('.rich-message-input')).toHaveCount(0);
});

test('standalone expansion owns placeholder visibility and control geometry without chat classes', async({page}) => {
  await open(page);
  const field = page.locator('.rich-message-input');
  await field.getByRole('button', {name: 'Insert table', exact: true}).click();
  const placeholder = field.locator('.chat-input-trailing-placeholder').last();
  await expect(placeholder).toBeVisible();
  await expect(field.locator('.input-message-input')).toHaveClass(/chat-input-editor-expanded/);
  const expandedHeight = (await field.boundingBox())!.height;
  await field.getByRole('button', {name: 'Collapse message editor', exact: true}).click();
  await expect(placeholder).toBeHidden();
  await expect(field.locator('.input-message-input')).not.toHaveClass(/chat-input-editor-expanded/);
  await expect(field.locator('.message-input-editor-toolbar-bottom')).toBeHidden();
  await expect.poll(async() => (await field.boundingBox())!.height).toBeLessThan(expandedHeight);
  await field.getByRole('button', {name: 'Expand message editor', exact: true}).click();
  await expect(placeholder).toBeVisible();
  await expect(field.locator('.message-input-editor-toolbar-bottom')).toBeVisible();
  await expect(field).not.toHaveClass(/chat-input-main/);
});

test('upload error offers retry and remove without losing another media item', async({page}) => {
  await open(page);
  await pick(page, 'Choose media');
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(1);
  await page.evaluate(() => window.richMediaComposerHarness.finish(0));
  await expect(page.locator('[data-upload-id]')).toHaveCount(0);
  const before = (await page.evaluate(() => window.richMediaComposerHarness.state())).document;
  await pick(page, 'Replace media');
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(2);
  await page.evaluate(() => window.richMediaComposerHarness.finish(1, false));
  await page.getByRole('button', {name: 'Try Again', exact: true}).click();
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(3);
  await page.evaluate(() => window.richMediaComposerHarness.finish(2, false));
  await page.getByRole('button', {name: 'Remove', exact: true}).click();
  await expect(page.locator('[data-upload-id]')).toHaveCount(0);
  expect((await page.evaluate(() => window.richMediaComposerHarness.state())).document).toEqual(before);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
});

test('cancel from the upload control ignores a late upload result', async({page}) => {
  await open(page);
  const before = (await page.evaluate(() => window.richMediaComposerHarness.state())).document;
  await pick(page, 'Choose media');
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(1);
  await page.getByRole('progressbar').click();
  await expect(page.locator('[data-upload-id]')).toHaveCount(0);
  await page.evaluate(() => window.richMediaComposerHarness.finish(0));
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).tasks).toBe(0);
  const state = await page.evaluate(() => window.richMediaComposerHarness.state());
  expect(state.document).toEqual(before);
  expect(state.cancelRequests).toBe(1);
  expect(state.sends).toBe(0);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
});

test('the media item Edit control opens the real image editor and cancelling preserves the document', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await pick(page, 'Choose media');
  await expect.poll(async() => (await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(1);
  await page.evaluate(() => window.richMediaComposerHarness.finish(0));
  await expect(page.locator('[data-upload-id]')).toHaveCount(0);
  const before = (await page.evaluate(() => window.richMediaComposerHarness.state())).document;
  await page.locator('.chat-input-rich-media-preview').hover();
  await page.locator('.chat-input-rich-media-more').click();
  await page.getByRole('menuitem', {name: /Edit Media/}).click();
  await expect(page.locator('.media-editor__container')).toBeVisible();
  await page.locator('.media-editor__topbar button').first().click();
  await expect(page.locator('.media-editor__container')).toHaveCount(0);
  expect((await page.evaluate(() => window.richMediaComposerHarness.state())).document).toEqual(before);
  expect((await page.evaluate(() => window.richMediaComposerHarness.state())).uploads).toBe(1);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
  expect(errors).toEqual([]);
});
