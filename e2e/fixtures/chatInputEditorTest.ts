import {expect, type Page} from '@playwright/test';
import type {ChatInputEditorBrowserHarness} from './chatInputEditor';

export async function openEditor(page: Page, waitUntil: 'load' | 'domcontentloaded' = 'load') {
  await page.goto('/e2e/fixtures/chatInputEditor.html', {waitUntil});
  await page.waitForFunction(() => document.documentElement.dataset.editorFixtureReady !== undefined);
}

export async function settleNativeSelection(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // The editor reads a caret the browser moved itself on `selectionchange`, which WebKit sends
      // when it gets to it: under load, later than these two frames. Hand it the event now; with
      // nothing moved it reads what it already holds.
      document.dispatchEvent(new Event('selectionchange'));
      resolve();
    }));
  }));
}

export async function setEditorDocument(page: Page, document: Parameters<ChatInputEditorBrowserHarness['setDocument']>[0]) {
  expect(await page.evaluate((document) => (
    window.chatInputEditorHarness.setDocument(document)
  ), document)).toBe(true);
  await settleNativeSelection(page);
}
