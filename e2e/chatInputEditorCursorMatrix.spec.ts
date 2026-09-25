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

async function textblocks(page: Page) {
  return page.evaluate(() => window.chatInputEditorHarness.textblocks());
}

function blockIndex(blocks: TextblockDescriptor[], value: string) {
  const index = blocks.findIndex(({text}) => text === value);
  expect(index, `Missing textblock ${JSON.stringify(value)}`).toBeGreaterThanOrEqual(0);
  return index;
}

async function setCaretInBlock(
  page: Page,
  blocks: TextblockDescriptor[],
  value: string,
  edge: 'end' | 'start'
) {
  expect(await page.evaluate(({edge, index}) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, edge)
  ), {edge, index: blockIndex(blocks, value)})).toBe(true);
}

async function expectTextSelection(page: Page, value: string, offset?: number) {
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe(value);
  if(offset !== undefined) expect(selection.parentOffset).toBe(offset);
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('virtual Backspace deletes a Unicode grapheme across formatting boundaries', async({page}) => {
  for(const grapheme of ['e\u0301', '👩🏽‍💻', '🇦🇪']) {
    const document: JSONContent = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          text('A'),
          ...Array.from(grapheme).map((value, index) => ({
            type: 'text', text: value, marks: [{type: index % 2 ? 'italic' : 'bold'}]
          })),
          text('B')
        ]
      }]
    };
    await setDocument(page, document);
    expect(await page.evaluate((offset) => (
      window.chatInputEditorHarness.setCaretInNode('paragraph', 0, offset)
    ), 1 + grapheme.length)).toBe(true);
    expect(await page.evaluate(() => window.chatInputEditorHarness.deleteBackward())).toBe(true);
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({type: 'doc', content: [paragraph('AB')]});
    await page.keyboard.press('ControlOrMeta+z');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(document);
  }
});

test('moves exactly between adjacent plain paragraphs in every arrow direction', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Alpha'), paragraph('Bravo')]
  });
  const blocks = await textblocks(page);

  await setCaretInBlock(page, blocks, 'Bravo', 'start');
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Alpha', 'Alpha'.length);

  await setCaretInBlock(page, blocks, 'Alpha', 'end');
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Bravo', 0);

  await setCaretInBlock(page, blocks, 'Bravo', 'start');
  await page.keyboard.press('ArrowUp');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Alpha');

  await setCaretInBlock(page, blocks, 'Alpha', 'end');
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Bravo');
});

test('visits every visible rich-container surface in exact document order', async({page}) => {
  test.setTimeout(60_000);
  await setDocument(page, {
    type: 'doc',
    content: [
      paragraph('Before'),
      {
        type: 'blockquote',
        content: [
          paragraph('Quote one'),
          paragraph('Quote two'),
          {type: 'blockquoteCaption', content: [text('Quote author')]}
        ]
      },
      {
        type: 'pullquote',
        content: [
          {type: 'pullquoteText', content: [text('Pullquote')]},
          {type: 'pullquoteCaption', content: [text('Pullquote author')]}
        ]
      },
      {
        type: 'details',
        attrs: {open: true},
        content: [
          {type: 'detailsSummary', content: [text('Open details')]},
          {
            type: 'detailsBody',
            content: [paragraph('Body one'), paragraph('Body two')]
          }
        ]
      },
      {
        type: 'details',
        attrs: {open: false},
        content: [
          {type: 'detailsSummary', content: [text('Closed details')]},
          {type: 'detailsBody', content: [paragraph('Hidden body')]}
        ]
      },
      {
        type: 'bulletList',
        content: ['Bullet one', 'Bullet two'].map((value) => ({
          type: 'listItem',
          content: [paragraph(value)]
        }))
      },
      paragraph('After')
    ]
  });
  const blocks = await textblocks(page);
  const order = [
    'Before',
    'Quote one',
    'Quote two',
    'Quote author',
    'Pullquote',
    'Pullquote author',
    'Open details',
    'Body one',
    'Body two',
    'Closed details',
    'Bullet one',
    'Bullet two',
    'After'
  ];
  expect(blocks.find(({text}) => text === 'Hidden body')?.visible).toBe(false);

  for(let index = 0; index < order.length - 1; ++index) {
    const source = order[index];
    const target = order[index + 1];
    await test.step(`ArrowDown ${source} → ${target}`, async() => {
      await setCaretInBlock(page, blocks, source, 'end');
      await page.keyboard.press('ArrowDown');
      await settleNativeSelection(page);
      await expectTextSelection(page, target);
    });
    await test.step(`ArrowRight ${source} → ${target}`, async() => {
      await setCaretInBlock(page, blocks, source, 'end');
      await page.keyboard.press('ArrowRight');
      await settleNativeSelection(page);
      await expectTextSelection(page, target, 0);
    });
  }

  for(let index = order.length - 1; index > 0; --index) {
    const source = order[index];
    const target = order[index - 1];
    await test.step(`ArrowUp ${source} → ${target}`, async() => {
      await setCaretInBlock(page, blocks, source, 'start');
      await page.keyboard.press('ArrowUp');
      await settleNativeSelection(page);
      await expectTextSelection(page, target);
    });
    await test.step(`ArrowLeft ${source} → ${target}`, async() => {
      await setCaretInBlock(page, blocks, source, 'start');
      await page.keyboard.press('ArrowLeft');
      await settleNativeSelection(page);
      await expectTextSelection(page, target, target.length);
    });
  }
});

test('stops on every top-level atom instead of skipping it', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [
      paragraph('Before'),
      {type: 'blockMath', attrs: {source: 'x^2'}},
      {type: 'richDivider'},
      {type: 'opaqueRichBlock', attrs: {block: {_: 'pageBlockUnsupported'}}},
      paragraph('After')
    ]
  });
  const blocks = await textblocks(page);
  await setCaretInBlock(page, blocks, 'Before', 'end');

  for(const type of ['blockMath', 'richDivider', 'opaqueRichBlock']) {
    await page.keyboard.press('ArrowRight');
    await settleNativeSelection(page);
    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('node');
    expect(selection.nodeType).toBe(type);
  }
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'After', 0);

  for(const type of ['opaqueRichBlock', 'richDivider', 'blockMath']) {
    await page.keyboard.press('ArrowLeft');
    await settleNativeSelection(page);
    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('node');
    expect(selection.nodeType).toBe(type);
  }
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Before', 'Before'.length);
});

test('moves by complete Unicode graphemes without splitting them', async({page}) => {
  const graphemes = ['🙂', 'e\u0301', '👨‍👩‍👧‍👦', '🇦🇪'];
  for(const grapheme of graphemes) {
    const value = `A${grapheme}B`;
    await setDocument(page, {type: 'doc', content: [paragraph(value)]});
    const blocks = await textblocks(page);
    const block = blocks.find(({text}) => text === value)!;
    const before = block.from + 1;
    const after = before + grapheme.length;

    expect(await page.evaluate((position) => (
      window.chatInputEditorHarness.setCaret(position)
    ), after)).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await settleNativeSelection(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
    .toBe(before);

    expect(await page.evaluate((position) => (
      window.chatInputEditorHarness.setCaret(position)
    ), before)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await settleNativeSelection(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
    .toBe(after);
  }
});

test('extends selections across inline atoms and paragraph boundaries', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [text('A'), {type: 'inlineMath', attrs: {source: 'x'}}, text('B')]
    }, paragraph('Next')]
  });
  const atomPosition = (await page.evaluate(() => (
    window.chatInputEditorHarness.nodePositions('inlineMath')
  )))[0];
  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), atomPosition)).toBe(true);
  await page.keyboard.press('Shift+ArrowRight');
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(atomPosition);
  expect(selection.to).toBe(atomPosition + 1);

  await page.keyboard.press('Shift+ArrowRight');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(atomPosition);
  expect(selection.to).toBe(atomPosition + 2);

  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), atomPosition + 1)).toBe(true);
  await page.keyboard.press('Shift+ArrowLeft');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(atomPosition);
  expect(selection.to).toBe(atomPosition + 1);

  await page.keyboard.press('Shift+ArrowLeft');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(atomPosition - 1);
  expect(selection.to).toBe(atomPosition + 1);

  const blocks = await textblocks(page);
  const inlineBlock = blocks[0];
  const nextBlock = blocks.find(({text}) => text === 'Next')!;
  expect(await page.evaluate(({index}) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'end')
  ), {index: 0})).toBe(true);
  await page.keyboard.press('Shift+ArrowRight');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.from).toBe(inlineBlock.to);
  expect(selection.to).toBe(nextBlock.from);

  await page.keyboard.press('Shift+ArrowRight');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(inlineBlock.to);
  expect(selection.to).toBe(nextBlock.from + 1);
});

test('Backspace and Delete join adjacent non-empty paragraphs symmetrically', async({page}) => {
  const document: JSONContent = {
    type: 'doc',
    content: [paragraph('Alpha'), paragraph('Bravo')]
  };

  await setDocument(page, document);
  let blocks = await textblocks(page);
  await setCaretInBlock(page, blocks, 'Bravo', 'start');
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'AlphaBravo', 'Alpha'.length);

  await setDocument(page, document);
  blocks = await textblocks(page);
  await setCaretInBlock(page, blocks, 'Alpha', 'end');
  await page.keyboard.press('Delete');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'AlphaBravo', 'Alpha'.length);
});

test('enters and leaves an empty paragraph without skipping its placeholder', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Before'), paragraph(), paragraph('After')]
  });
  const blocks = await textblocks(page);
  const before = blockIndex(blocks, 'Before');
  const empty = blocks.findIndex((block, index) => (
    index > before && !block.text && block.visible
  ));
  const after = blockIndex(blocks, 'After');
  expect(empty).toBeGreaterThan(before);
  expect(empty).toBeLessThan(after);

  for(const {edge, key, source, target} of [
    {edge: 'end', key: 'ArrowDown', source: before, target: empty},
    {edge: 'end', key: 'ArrowRight', source: before, target: empty},
    {edge: 'start', key: 'ArrowDown', source: empty, target: after},
    {edge: 'start', key: 'ArrowRight', source: empty, target: after},
    {edge: 'start', key: 'ArrowUp', source: after, target: empty},
    {edge: 'start', key: 'ArrowLeft', source: after, target: empty},
    {edge: 'start', key: 'ArrowUp', source: empty, target: before},
    {edge: 'start', key: 'ArrowLeft', source: empty, target: before}
  ] as const) {
    expect(await page.evaluate(({edge, index}) => (
      window.chatInputEditorHarness.setCaretInTextblock(index, edge)
    ), {edge, index: source})).toBe(true);
    await page.keyboard.press(key);
    await settleNativeSelection(page);
    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('text');
    expect(selection.from).toBeGreaterThanOrEqual(blocks[target].from);
    expect(selection.to).toBeLessThanOrEqual(blocks[target].to);
  }
});

test('uses visual horizontal directions in an RTL editor', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [paragraph('ألف'), paragraph('باء')]
  });
  await page.evaluate(() => window.chatInputEditorHarness.setDirection('rtl'));
  const blocks = await textblocks(page);

  await setCaretInBlock(page, blocks, 'ألف', 'end');
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'باء', 0);

  await setCaretInBlock(page, blocks, 'باء', 'start');
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'ألف', 'ألف'.length);
});

test('crosses inline atoms in mixed-direction text by visual direction', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        text('Latin אבג '),
        {type: 'inlineMath', attrs: {source: 'x'}},
        text(' مرحبا Latin')
      ]
    }]
  });
  const atomPosition = (await page.evaluate(() => (
    window.chatInputEditorHarness.nodePositions('inlineMath')
  )))[0];

  await page.evaluate(() => window.chatInputEditorHarness.setDirection('ltr'));
  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), atomPosition)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(atomPosition + 1);

  await page.evaluate(() => window.chatInputEditorHarness.setDirection('rtl'));
  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), atomPosition)).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(atomPosition + 1);

  await page.keyboard.press('Shift+ArrowRight');
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBe(atomPosition);
  expect(selection.to).toBe(atomPosition + 1);
});

test('moves one character across adjacent mark boundaries', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        {type: 'text', text: 'A', marks: [{type: 'bold'}]},
        {type: 'text', text: 'B', marks: [{type: 'italic'}]},
        {type: 'text', text: 'C'}
      ]
    }]
  });
  const block = (await textblocks(page))[0];

  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), block.from + 1)).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(block.from);

  expect(await page.evaluate((position) => (
    window.chatInputEditorHarness.setCaret(position)
  ), block.from + 1)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(block.from + 2);
});

test('deletes exactly one inline atom with Backspace or Delete', async({page}) => {
  const document: JSONContent = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [text('A'), {type: 'inlineMath', attrs: {source: 'x'}}, text('B')]
    }]
  };

  for(const {key, side} of [
    {key: 'Delete', side: 0},
    {key: 'Backspace', side: 1}
  ] as const) {
    await setDocument(page, document);
    const position = (await page.evaluate(() => (
      window.chatInputEditorHarness.nodePositions('inlineMath')
    )))[0];
    expect(await page.evaluate((position) => (
      window.chatInputEditorHarness.setCaret(position)
    ), position + side)).toBe(true);
    await page.keyboard.press(key);
    await settleNativeSelection(page);
    expect(await page.evaluate(() => (
      window.chatInputEditorHarness.nodePositions('inlineMath')
    ))).toEqual([]);
    await expectTextSelection(page, 'AB', 1);
  }
});

test('deletes each selected top-level atom without taking neighboring text with it', async({page}) => {
  const atoms: JSONContent[] = [
    {type: 'blockMath', attrs: {source: 'x'}},
    {type: 'richDivider'},
    {type: 'opaqueRichBlock', attrs: {block: {_: 'pageBlockUnsupported'}}}
  ];
  for(const atom of atoms) {
    for(const key of ['Backspace', 'Delete']) {
      await setDocument(page, {
        type: 'doc',
        content: [paragraph('Before'), atom, paragraph('After')]
      });
      expect(await page.evaluate((type) => (
        window.chatInputEditorHarness.setNodeSelection(type)
      ), atom.type!)).toBe(true);
      await page.keyboard.press(key);
      await settleNativeSelection(page);
      expect(await page.evaluate((type) => (
        window.chatInputEditorHarness.nodePositions(type)
      ), atom.type!)).toEqual([]);
      const document = await page.evaluate(() => window.chatInputEditorHarness.document());
      expect(JSON.stringify(document)).toContain('Before');
      expect(JSON.stringify(document)).toContain('After');
      expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type)
      .toBe('text');
    }
  }
});

test('Backspace moves from Details body to title and unwraps an entirely empty Details', async({page}) => {
  const details = (title: string): JSONContent => ({
    type: 'details',
    attrs: {open: true},
    content: [
      {type: 'detailsSummary', content: title ? [text(title)] : undefined},
      {type: 'detailsBody', content: [paragraph()]}
    ]
  });

  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Before'), details('Title'), paragraph('After')]
  });
  let blocks = await textblocks(page);
  const body = blocks.findIndex(({path, text}) => path.includes('detailsBody') && !text);
  expect(body).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'start')
  ), body)).toBe(true);
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  await expectTextSelection(page, 'Title', 'Title'.length);

  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Before'), details(''), paragraph('After')]
  });
  blocks = await textblocks(page);
  const summary = blocks.findIndex(({path}) => path.includes('detailsSummary'));
  expect(summary).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((index) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, 'start')
  ), summary)).toBe(true);
  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.nodePositions('details')
  ))).toEqual([]);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type)
  .toBe('text');
});
