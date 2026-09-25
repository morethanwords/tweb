import {openEditor, settleNativeSelection as settle} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {ChatInputEditorBrowserHarness} from './fixtures/chatInputEditor';
import {CHAT_INPUT_EDITOR_TEST_MEDIA_URL} from '@components/chat/inputEditor/testData';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

async function beginUpload(page: Page, action?: 'add' | 'replace') {
  if(action) {
    expect(await page.evaluate((url) => window.chatInputEditorHarness.insertTestPhoto(url), CHAT_INPUT_EDITOR_TEST_MEDIA_URL)).toBe(true);
    await page.evaluate(() => window.chatInputEditorHarness.setDocument(window.chatInputEditorHarness.document()));
    expect(await page.evaluate(() => window.chatInputEditorHarness.setNodeSelection('richMedia'))).toBe(true);
  }
  const before = await page.evaluate(() => window.chatInputEditorHarness.document());
  const id = await page.evaluate((action) => window.chatInputEditorHarness.beginManagedUpload(action), action);
  expect(id).toBeTruthy();
  await settle(page);
  return {before, id: id!};
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

for(const action of [undefined, 'add', 'replace'] as const) {
  test(`${action || 'insert'} upload survives Undo, background completion and Redo`, async({page}) => {
    const {before, id} = await beginUpload(page, action);
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
    expect(await page.evaluate((id) => window.chatInputEditorHarness.hasManagedUpload(id), id)).toBe(true);
    expect(await page.evaluate((id) => window.chatInputEditorHarness.completeManagedUpload(id), id)).toBe(true);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(page);
    expect(await page.evaluate((id) => window.chatInputEditorHarness.hasManagedUpload(id), id)).toBe(false);
    const completed = await page.evaluate(() => window.chatInputEditorHarness.document());
    expect(completed).not.toEqual(before);
    expect(completed.content?.[0].attrs?.uploadId).toBe('');
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(completed);
  });

  test(`${action || 'insert'} upload completion preserves native media selection`, async({page}) => {
    const {id} = await beginUpload(page, action);
    expect(await page.evaluate(() => window.chatInputEditorHarness.setNodeSelection('richMedia'))).toBe(true);
    expect(await page.evaluate((id) => window.chatInputEditorHarness.completeManagedUpload(id), id)).toBe(true);
    await settle(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type).toBe('node');
    await expect(page.locator('.chat-input-rich-media.ProseMirror-selectednode')).toHaveCount(1);
  });
}

for(const backward of [false, true]) {
  test(`upload completion keeps a cross-caption native range with backward=${backward}`, async({page}) => {
    await page.evaluate(() => window.chatInputEditorHarness.setDocument({
      type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Before'}]}]
    }));
    expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0, 'end'))).toBe(true);
    const {id} = await beginUpload(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('richMedia'))).toBe(true);
    await page.keyboard.insertText('Caption');
    const mediaPosition = (await page.evaluate(() => window.chatInputEditorHarness.nodePositions('richMedia')))[0];
    expect(await page.evaluate(({to, backward}) => window.chatInputEditorHarness.setTextSelection(1, to, backward), {
      to: mediaPosition + 4, backward
    })).toBe(true);
    await settle(page);
    const before = await page.evaluate(() => ({
      model: window.chatInputEditorHarness.selection(),
      // Firefox includes whitespace from non-editable progress SVGs in
      // Selection.toString(). Check editor text and the native endpoints instead.
      text: window.chatInputEditorHarness.selectedText(),
      anchorText: window.getSelection()?.anchorNode?.textContent,
      focusText: window.getSelection()?.focusNode?.textContent,
      anchor: window.getSelection()?.anchorOffset,
      focus: window.getSelection()?.focusOffset
    }));
    expect(await page.evaluate((id) => window.chatInputEditorHarness.completeManagedUpload(id), id)).toBe(true);
    await settle(page);
    expect(await page.evaluate(() => ({
      model: window.chatInputEditorHarness.selection(),
      text: window.chatInputEditorHarness.selectedText(),
      anchorText: window.getSelection()?.anchorNode?.textContent,
      focusText: window.getSelection()?.focusNode?.textContent,
      anchor: window.getSelection()?.anchorOffset,
      focus: window.getSelection()?.focusOffset
    }))).toEqual(before);
  });
}
