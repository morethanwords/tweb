import {openEditor, settleNativeSelection, setEditorDocument as setDocument} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import type {ChatInputEditorBrowserHarness, TextblockDescriptor} from './fixtures/chatInputEditor';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

const text = (value: string): JSONContent => ({type: 'text', text: value});
const paragraph = (value = ''): JSONContent => ({
  type: 'paragraph',
  content: value ? [text(value)] : undefined
});
const cell = (
  value: string,
  type: 'tableCell' | 'tableHeader' = 'tableCell',
  attrs?: Record<string, unknown>
): JSONContent => ({
  type,
  attrs,
  content: [paragraph(value)]
});
const tableDocument = (
  rows: JSONContent[][],
  title = 'Title'
): JSONContent => ({
  type: 'doc',
  content: [{
    type: 'chatTableWrapper',
    content: [
      {type: 'chatTableTitle', content: title ? [text(title)] : undefined},
      {
        type: 'table',
        content: rows.map((content) => ({type: 'tableRow', content}))
      }
    ]
  }]
});

async function blocks(page: Page) {
  return page.evaluate(() => window.chatInputEditorHarness.textblocks());
}

function blockIndex(
  descriptors: TextblockDescriptor[],
  value: string,
  occurrence = 0
) {
  let current = 0;
  const index = descriptors.findIndex(({text}) => (
    text === value && current++ === occurrence
  ));
  expect(index, `Missing table textblock ${JSON.stringify(value)}`).toBeGreaterThanOrEqual(0);
  return index;
}

async function setCaret(
  page: Page,
  descriptors: TextblockDescriptor[],
  value: string,
  edge: 'end' | 'start' | number,
  occurrence = 0
) {
  expect(await page.evaluate(({edge, index}) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, edge)
  ), {edge, index: blockIndex(descriptors, value, occurrence)})).toBe(true);
}

async function selectedTextblock(page: Page, value: string) {
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe(value);
  return selection;
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('navigates a merged table by its visual grid', async({page}) => {
  await setDocument(page, tableDocument([
    [
      cell('Wide header', 'tableHeader', {colspan: 2, rowspan: 1}),
      cell('Right header', 'tableHeader')
    ],
    [cell('Left'), cell('Middle'), cell('Right')]
  ]));
  const descriptors = await blocks(page);
  for(const {edge, expected, key, source} of [
    {edge: 'end', expected: 'Left', key: 'ArrowDown', source: 'Wide header'},
    {edge: 'end', expected: 'Right', key: 'ArrowDown', source: 'Right header'},
    {edge: 'start', expected: 'Wide header', key: 'ArrowUp', source: 'Left'},
    {edge: 'start', expected: 'Wide header', key: 'ArrowUp', source: 'Middle'},
    {edge: 'start', expected: 'Right header', key: 'ArrowUp', source: 'Right'}
  ] as const) {
    await setCaret(page, descriptors, source, edge);
    await page.keyboard.press(key);
    await settleNativeSelection(page);
    await selectedTextblock(page, expected);
  }
});

test('navigates a table with combined rowspans and colspans by visual columns', async({page}) => {
  await setDocument(page, tableDocument([
    [
      cell('Spanning', 'tableHeader', {colspan: 2, rowspan: 2}),
      cell('Top right', 'tableHeader')
    ],
    [cell('Middle right')],
    [cell('Bottom left'), cell('Bottom middle'), cell('Bottom right')]
  ]));
  const descriptors = await blocks(page);

  for(const {edge, expected, key, source} of [
    {edge: 'end', expected: 'Bottom left', key: 'ArrowDown', source: 'Spanning'},
    {edge: 'end', expected: 'Middle right', key: 'ArrowDown', source: 'Top right'},
    {edge: 'end', expected: 'Bottom right', key: 'ArrowDown', source: 'Middle right'},
    {edge: 'start', expected: 'Spanning', key: 'ArrowUp', source: 'Bottom left'},
    {edge: 'start', expected: 'Spanning', key: 'ArrowUp', source: 'Bottom middle'},
    {edge: 'start', expected: 'Middle right', key: 'ArrowUp', source: 'Bottom right'}
  ] as const) {
    await setCaret(page, descriptors, source, edge);
    await page.keyboard.press(key);
    await settleNativeSelection(page);
    await selectedTextblock(page, expected);
  }
});

test('keeps ArrowDown inside a multiline cell before moving to the next row', async({page}) => {
  const document = tableDocument([
    [cell('Placeholder'), cell('B')],
    [cell('C'), cell('D')]
  ]);
  document.content![0].content![1].content![0].content![0].content = [{
    type: 'paragraph',
    content: [text('A1'), {type: 'hardBreak'}, text('A2')]
  }];
  await setDocument(page, document);
  const descriptors = await blocks(page);
  const multiline = descriptors.findIndex(({text}) => text === 'A1A2');
  expect(multiline).toBeGreaterThanOrEqual(0);

  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 2)
  ), multiline)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  let selection = await selectedTextblock(page, 'A1A2');
  expect(selection.parentOffset).toBeGreaterThan(2);

  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'end')
  ), multiline)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  selection = await selectedTextblock(page, 'C');
  expect(selection.parentOffset).toBe(0);
});

test('moves through empty cells and deletes an empty table in two explicit steps', async({page}) => {
  await setDocument(page, tableDocument([[cell('A'), cell('')]]));
  let descriptors = await blocks(page);
  const emptyCell = descriptors.findIndex(({path, text}) => (
    path.includes('tableCell') && !text
  ));
  expect(emptyCell).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'start')
  ), emptyCell)).toBe(true);
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  const previous = await selectedTextblock(page, 'A');
  expect(previous.parentOffset).toBe(1);

  await setDocument(page, tableDocument([[cell('')]], 'Title'));
  descriptors = await blocks(page);
  const firstCell = descriptors.findIndex(({path}) => path.includes('tableCell'));
  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'start')
  ), firstCell)).toBe(true);
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  const title = await selectedTextblock(page, 'Title');
  expect(title.parentOffset).toBe('Title'.length);

  await setDocument(page, tableDocument([[cell('')]], ''));
  await page.locator('.chat-input-table-title').click();
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).path)
  .toContain('chatTableTitle');
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type)
  .toBe('cell');
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('table')))
  .toHaveLength(1);
  const frame = page.locator('.chat-input-table-active-cell-frame');
  await expect(frame).toBeVisible();
  expect(await frame.evaluate((element) => ({
    hasSize: Number.parseFloat((element as HTMLElement).style.height) > 0 &&
      Number.parseFloat((element as HTMLElement).style.width) > 0,
    hidden: (element as HTMLElement).hidden
  }))).toEqual({
    hasSize: true,
    hidden: false
  });

  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('table')))
  .toEqual([]);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type)
  .toBe('text');
});

test('triple click selects the textblock instead of its table cell', async({page}) => {
  const value = 'Whole cell line';
  await setDocument(page, tableDocument([[cell(value), cell('Other')]]));

  await page.locator('.chat-input-table td [data-chat-input-paragraph]')
  .first()
  .click({clickCount: 3});
  await settleNativeSelection(page);

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe(value);
  expect(selection.to - selection.from).toBe(value.length);
  expect(await page.locator('.chat-input-table td.selectedCell').count()).toBe(0);
});

test('cycles through cells with Tab and creates a row only after the final cell', async({page}) => {
  await setDocument(page, tableDocument([
    [cell('A', 'tableHeader'), cell('B', 'tableHeader')],
    [cell('C'), cell('D')]
  ]));
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Title', 'end');

  for(const value of ['A', 'B', 'C', 'D']) {
    await page.keyboard.press('Tab');
    await settleNativeSelection(page);
    await selectedTextblock(page, value);
  }
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('tableRow')))
  .toHaveLength(2);

  await page.keyboard.press('Tab');
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('tableRow')))
  .toHaveLength(3);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe('');
  expect(selection.path).toContain('tableCell');

  await page.keyboard.press('Shift+Tab');
  await settleNativeSelection(page);
  await selectedTextblock(page, 'D');
});

test('uses the visual exit arrow in the final RTL table cell', async({page}) => {
  await setDocument(page, tableDocument([[cell('A'), cell('B')]]));
  await page.evaluate(() => {
    const table = document.querySelector<HTMLTableElement>('table.chat-input-table');
    if(table) table.style.direction = 'rtl';
  });
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'B', 'end');
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  const insideSelection = await page.evaluate(() => (
    window.chatInputEditorHarness.selection()
  ));
  expect(insideSelection.type).toBe('text');
  expect(insideSelection.path).toContain('tableCell');

  await setCaret(page, descriptors, 'B', 'end');
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe('');
  expect(selection.path).not.toContain('tableCell');
});

test('progresses Select All from cell text to table cells to the whole document', async({page}) => {
  await setDocument(page, tableDocument([[cell('Alpha'), cell('Bravo')]]));
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Alpha', 2);
  const selectAll = await page.evaluate(() => (
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Meta+A' : 'Control+A'
  ));

  await page.keyboard.press(selectAll);
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.from).toBeLessThan(selection.to);
  expect(selection.text).toBe('Alpha');

  await page.keyboard.press(selectAll);
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('cell');

  await page.keyboard.press(selectAll);
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('all');
});
