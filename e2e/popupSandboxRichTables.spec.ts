import {expect, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import {test} from './workerContext';
import type {RichTableSurface, RichTablesHarness} from './fixtures/richTables';

declare global {
  interface Window {
    richTables: RichTablesHarness
  }
}

// Layout is a browser's to do: jsdom lays nothing out, so a table's columns are measured here.

const SURFACES: RichTableSurface[] = ['editor', 'instant-view', 'message'];
// each wider than the whole table, with nowhere to wrap
const UNBREAKABLE = [
  'Supercalifragilisticexpialidocious_and_some_more_unbreakable_text_here',
  '12312333333333333333333333333333333333333333333333',
  'https://example.com/some/very/long/path/that/goes/on/and/on'
];

const paragraph = (text?: string): JSONContent => ({type: 'paragraph', content: text ? [{type: 'text', text}] : undefined});
const cell = (text?: string, attrs?: Record<string, unknown>): JSONContent => ({type: 'tableCell', attrs, content: [paragraph(text)]});
const header = (text?: string, attrs?: Record<string, unknown>): JSONContent => ({type: 'tableHeader', attrs, content: [paragraph(text)]});
const table = (rows: JSONContent[][], attrs: Record<string, unknown> = {}): JSONContent => ({type: 'chatTableWrapper', content: [
  {type: 'chatTableTitle'},
  {type: 'table', attrs, content: rows.map((content) => ({type: 'tableRow', content}))}
]});

async function open(page: Page) {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async() => {
    const path = '/e2e/fixtures/richTables.ts';
    const {mountRichTables} = await import(/* @vite-ignore */ path);
    window.richTables = mountRichTables(420);
  });
  await expect.poll(() => page.evaluate(() => [...document.fonts]
  .filter((font) => font.status === 'loading').length)).toBe(0);
}

async function setTable(page: Page, content: JSONContent) {
  expect(await page.evaluate((content) => window.richTables.setTable(content), content)).toBe(true);
}

const widths = (page: Page, surface: RichTableSurface, row = 0) => page.evaluate(
  ({surface, row}) => window.richTables.columnWidths(surface, row),
  {surface, row}
);

function expectEqual(values: number[], message: string) {
  expect(Math.max(...values) - Math.min(...values), `${message}: ${values.join(' / ')}`).toBeLessThanOrEqual(1);
}

function expectSame(actual: number[], expected: number[], message: string) {
  expect(actual, message).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index]), `${message}: ${actual.join(' / ')} vs ${expected.join(' / ')}`).toBeLessThanOrEqual(1));
}

test.beforeEach(async({page}) => {
  await open(page);
});

test('columns share the width equally whatever their text, in the composer and as sent', async({page}) => {
  await setTable(page, table([
    [header('13213'), header('3213'), header()],
    [cell('1231233333'), cell('123213'), cell()],
    [cell('a whole sentence that is long enough to wrap around inside its cell more than once'), cell(), cell('x')]
  ]));

  const editor = await widths(page, 'editor');
  expectEqual(editor, 'editor');
  for(const surface of SURFACES) {
    const columns = await widths(page, surface);
    expectEqual(columns, surface);
    expectSame(columns, editor, `${surface} against the editor`);
    for(const row of [1, 2]) expectSame(await widths(page, surface, row), columns, `${surface} row ${row}`);
    expect(await page.evaluate((surface) => window.richTables.overflows(surface), surface), surface).toBe(false);
  }
});

test('a long word, number or link breaks inside its cell and moves no column', async({page}) => {
  for(const text of UNBREAKABLE) {
    await setTable(page, table([
      [header('A'), header('B'), header('C')],
      [cell(text), cell('x'), cell('y')]
    ]));

    const editor = await widths(page, 'editor', 1);
    expectEqual(editor, `editor, ${text}`);
    for(const surface of SURFACES) {
      expectSame(await widths(page, surface, 1), editor, `${surface} against the editor, ${text}`);
      expect(await page.evaluate((surface) => window.richTables.spills(surface), surface), `${surface} spills ${text}`).toBe(false);
      expect(await page.evaluate((surface) => window.richTables.overflows(surface), surface), `${surface} overflows with ${text}`).toBe(false);
    }
  }
});

test('a formula, which cannot break, widens its column, and a table that cannot fit then scrolls', async({page}) => {
  const formula = (source: string): JSONContent => ({type: 'tableCell', content: [
    {type: 'paragraph', content: [{type: 'inlineMath', attrs: {source}}]}
  ]});
  await setTable(page, table([
    [header('A'), header('B'), header('C')],
    [formula('a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z'), cell('x'), cell('y')]
  ]));

  for(const surface of SURFACES) {
    await expect.poll(() => page.evaluate((surface) => window.richTables.overflows(surface), surface), surface).toBe(true);
    const [wide, ...rest] = await widths(page, surface, 1);
    expect(wide, surface).toBeGreaterThan(rest[0] + 1);
    expectEqual(rest, `${surface} the other columns`);
  }
});

// six columns are narrower than their placeholder, which then must not size them either
for(const count of [3, 6]) test(`typing into an empty table of ${count} columns moves no column and no row`, async({page}) => {
  const row = (make: typeof cell) => Array.from({length: count}, () => make());
  await setTable(page, table([row(header), row(cell), row(cell)]));
  const columns = await widths(page, 'editor');
  const rows = await page.evaluate(() => window.richTables.rowHeights('editor'));
  expectEqual(columns, 'empty');

  // the first header cell, behind its placeholder, then a body cell
  for(const [index, text] of [[0, 'a'], [0, '1321'], [count, '12312']] as const) {
    expect(await page.evaluate((index) => window.richTables.focusCell(index), index)).toBe(true);
    await page.keyboard.type(text);
    expectSame(await widths(page, 'editor'), columns, `after typing ${text}`);
    expectSame(await page.evaluate(() => window.richTables.rowHeights('editor')), rows, `rows after typing ${text}`);
  }
});

test('cells spanning columns and rows keep the shares of the grid', async({page}) => {
  await setTable(page, table([
    [header('A', {rowspan: 2}), header('B wide', {colspan: 2})],
    [cell('1231233333'), cell('x')],
    [cell('a'), cell('b'), cell('c')]
  ]));

  const editor = await widths(page, 'editor', 2);
  expectEqual(editor, 'editor');
  for(const surface of SURFACES) {
    expectSame(await widths(page, surface, 2), editor, surface);
  }
});

test('a compact table shares the width the same way, with half the padding', async({page}) => {
  const rows = [
    [header('13213'), header('3213'), header()],
    [cell('1231233333'), cell('123213'), cell()]
  ];
  await setTable(page, table(rows));
  const regular = await page.evaluate(() => window.richTables.cellStyle('message', 1, 0));
  await setTable(page, table(rows, {compact: true}));
  for(const surface of SURFACES) {
    expectEqual(await widths(page, surface), `${surface} compact`);
    const compact = await page.evaluate((surface) => window.richTables.cellStyle(surface, 1, 0), surface);
    expect(parseFloat(compact.paddingTop), surface).toBeCloseTo(parseFloat(regular.paddingTop) / 2, 0);
  }
});

test('a column added in the composer takes its share', async({page}) => {
  await setTable(page, table([
    [header('A'), header('B'), header('C')],
    [cell('1'), cell('2'), cell('3')]
  ]));
  const [three] = await widths(page, 'editor');
  expect(await page.evaluate(() => window.richTables.focusCell(0))).toBe(true);
  expect(await page.evaluate(() => window.richTables.addColumnAfter())).toBe(true);

  const four = await widths(page, 'editor');
  expect(four).toHaveLength(4);
  expectEqual(four, 'four columns');
  expect(four[0]).toBeLessThan(three - 1);
});

test('a table draws its header cells, stripes, border and alignment the way it is sent', async({page}) => {
  await setTable(page, table([
    [header('Name'), header('Count'), header('Total')],
    [cell('left'), cell('center', {align: 'center'}), cell('right', {align: 'right'})],
    [cell('a'), cell('b'), cell('c')]
  ], {bordered: true, striped: true}));

  for(const surface of SURFACES) {
    const styles = await page.evaluate((surface) => [0, 1, 2].map((row) => (
      [0, 1, 2].map((column) => window.richTables.cellStyle(surface, row, column))
    )), surface);
    // a header cell is a header, drawn bold
    for(const style of styles[0]) {
      expect(style.tag, surface).toBe('TH');
      expect(Number(style.fontWeight), surface).toBeGreaterThanOrEqual(500);
    }
    expect(styles[1][0].tag, surface).toBe('TD');
    expect(Number(styles[1][0].fontWeight), surface).toBeLessThan(500);
    expect(styles[1].map((style) => style.textAlign), surface).toEqual(['left', 'center', 'right']);
    // every other row is shaded
    expect(styles[2][0].background, surface).not.toBe(styles[1][0].background);
    expect(await page.evaluate((surface) => window.richTables.hasBorder(surface), surface), surface).toBe(true);
  }

  // a new table is bordered unless it says otherwise
  await setTable(page, table([[header('Name')], [cell('a')], [cell('b')]], {bordered: false}));
  for(const surface of SURFACES) {
    const [first, second] = await page.evaluate((surface) => [1, 2].map((row) => (
      window.richTables.cellStyle(surface, row, 0)
    )), surface);
    expect(second.background, `${surface} not striped`).toBe(first.background);
    expect(await page.evaluate((surface) => window.richTables.hasBorder(surface), surface), `${surface} not bordered`).toBe(false);
  }
});
