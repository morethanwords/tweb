import {expect, type Page} from '@playwright/test';
import type {ChatInputEditorBrowserHarness} from './chatInputEditor';

export async function openEditor(page: Page, waitUntil: 'load' | 'domcontentloaded' = 'load') {
  await page.goto('/e2e/fixtures/chatInputEditor.html', {waitUntil});
  await page.waitForFunction(() => document.documentElement.dataset.editorFixtureReady !== undefined);
}

export async function settleNativeSelection(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function setEditorDocument(page: Page, document: Parameters<ChatInputEditorBrowserHarness['setDocument']>[0]) {
  expect(await page.evaluate((document) => (
    window.chatInputEditorHarness.setDocument(document)
  ), document)).toBe(true);
  await settleNativeSelection(page);
}
