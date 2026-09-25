import {openEditor, settleNativeSelection} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import type {ChatInputEditorBrowserHarness, TextblockDescriptor} from './fixtures/chatInputEditor';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

type BoundaryBlock = {
  atomType?: string,
  entry?: string,
  exit?: string,
  key: string,
  node(label: string): JSONContent
};

const text = (value: string): JSONContent => ({type: 'text', text: value});
const paragraph = (value: string): JSONContent => ({
  type: 'paragraph',
  content: [text(value)]
});
const item = (value: string, type = 'listItem'): JSONContent => ({
  type,
  attrs: type === 'taskItem' ? {checked: false} : undefined,
  content: [paragraph(value)]
});
const textblock = (
  key: string,
  type: string,
  attrs?: Record<string, unknown>
): BoundaryBlock => ({
  key,
  entry: 'only',
  exit: 'only',
  node: (label) => ({type, attrs, content: [text(`${label}:only`)]})
});
const atom = (key: string, type: string, attrs?: Record<string, unknown>): BoundaryBlock => ({
  atomType: type,
  key,
  node: () => ({type, attrs})
});

const BLOCKS: BoundaryBlock[] = [
  textblock('paragraph', 'paragraph'),
  textblock('heading', 'heading', {level: 3}),
  {
    key: 'blockquote',
    entry: 'body',
    exit: 'author',
    node: (label) => ({
      type: 'blockquote',
      content: [
        paragraph(`${label}:body`),
        {type: 'blockquoteCaption', content: [text(`${label}:author`)]}
      ]
    })
  },
  {
    key: 'pullquote',
    entry: 'body',
    exit: 'author',
    node: (label) => ({
      type: 'pullquote',
      content: [
        {type: 'pullquoteText', content: [text(`${label}:body`)]},
        {type: 'pullquoteCaption', content: [text(`${label}:author`)]}
      ]
    })
  },
  {
    key: 'details-open',
    entry: 'summary',
    exit: 'body',
    node: (label) => ({
      type: 'details',
      attrs: {open: true},
      content: [
        {type: 'detailsSummary', content: [text(`${label}:summary`)]},
        {type: 'detailsBody', content: [paragraph(`${label}:body`)]}
      ]
    })
  },
  {
    key: 'details-closed',
    entry: 'summary',
    exit: 'summary',
    node: (label) => ({
      type: 'details',
      attrs: {open: false},
      content: [
        {type: 'detailsSummary', content: [text(`${label}:summary`)]},
        {type: 'detailsBody', content: [paragraph(`${label}:hidden`)]}
      ]
    })
  },
  {
    key: 'bullet-list',
    entry: 'first',
    exit: 'last',
    node: (label) => ({
      type: 'bulletList',
      content: [item(`${label}:first`), item(`${label}:last`)]
    })
  },
  {
    key: 'ordered-list',
    entry: 'first',
    exit: 'last',
    node: (label) => ({
      type: 'orderedList',
      attrs: {start: 2},
      content: [item(`${label}:first`), item(`${label}:last`)]
    })
  },
  {
    key: 'task-list',
    entry: 'first',
    exit: 'last',
    node: (label) => ({
      type: 'taskList',
      content: [item(`${label}:first`, 'taskItem'), item(`${label}:last`, 'taskItem')]
    })
  },
  textblock('code', 'codeBlock', {language: ''}),
  {
    key: 'table',
    entry: 'title',
    exit: 'cell',
    node: (label) => ({
      type: 'chatTableWrapper',
      content: [
        {type: 'chatTableTitle', content: [text(`${label}:title`)]},
        {
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [{
              type: 'tableCell',
              content: [paragraph(`${label}:cell`)]
            }]
          }]
        }
      ]
    })
  },
  textblock('media', 'richMedia', {block: null, captionCredit: null}),
  atom('block-math', 'blockMath', {source: 'x'}),
  atom('divider', 'richDivider'),
  atom('opaque', 'opaqueRichBlock', {block: {_: 'pageBlockUnsupported'}})
];

async function descriptors(page: Page) {
  return page.evaluate(() => window.chatInputEditorHarness.textblocks());
}

function textblockIndex(blocks: TextblockDescriptor[], value: string) {
  const index = blocks.findIndex(({text}) => text === value);
  expect(index, `Missing pairwise textblock ${JSON.stringify(value)}`)
  .toBeGreaterThanOrEqual(0);
  return index;
}

async function setBoundary(
  page: Page,
  block: BoundaryBlock,
  label: string,
  edge: 'entry' | 'exit',
  atomOccurrence: number
) {
  if(block.atomType) {
    expect(await page.evaluate(({occurrence, type}) => (
      window.chatInputEditorHarness.setNodeSelection(type, occurrence)
    ), {occurrence: atomOccurrence, type: block.atomType})).toBe(true);
    return;
  }
  const blocks = await descriptors(page);
  const suffix = edge === 'entry' ? block.entry : block.exit;
  const index = textblockIndex(blocks, `${label}:${suffix}`);
  const caretEdge: 'end' | 'start' = edge === 'entry' ? 'start' : 'end';
  expect(await page.evaluate(({caretEdge, index}) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, caretEdge)
  ), {caretEdge, index})).toBe(true);
}

async function expectBoundary(
  page: Page,
  block: BoundaryBlock,
  label: string,
  edge: 'entry' | 'exit',
  atomOccurrence: number
) {
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  if(block.atomType) {
    const positions = await page.evaluate((type) => (
      window.chatInputEditorHarness.nodePositions(type)
    ), block.atomType);
    expect(selection.type).toBe('node');
    expect(selection.nodeType).toBe(block.atomType);
    expect(selection.from).toBe(positions[atomOccurrence]);
    return;
  }
  const suffix = edge === 'entry' ? block.entry : block.exit;
  const value = `${label}:${suffix}`;
  expect(selection.type).toBe('text');
  expect(selection.text).toBe(value);
  expect(selection.parentOffset).toBe(edge === 'entry' ? 0 : value.length);
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('crosses every ordered pair of top-level block classes in both directions', async({page}) => {
  test.setTimeout(180_000);
  for(const source of BLOCKS) {
    for(const target of BLOCKS) {
      const sourceLabel = `source-${source.key}`;
      const targetLabel = `target-${target.key}`;
      await test.step(`${source.key} → ${target.key}`, async() => {
        expect(await page.evaluate((document) => (
          window.chatInputEditorHarness.setDocument(document)
        ), {
          type: 'doc',
          content: [source.node(sourceLabel), target.node(targetLabel)]
        })).toBe(true);
        await settleNativeSelection(page);
        const targetOccurrence = source.atomType === target.atomType && !!target.atomType ? 1 : 0;

        await setBoundary(page, source, sourceLabel, 'exit', 0);
        await page.keyboard.press('ArrowRight');
        await settleNativeSelection(page);
        await expectBoundary(page, target, targetLabel, 'entry', targetOccurrence);

        await setBoundary(page, target, targetLabel, 'entry', targetOccurrence);
        await page.keyboard.press('ArrowLeft');
        await settleNativeSelection(page);
        await expectBoundary(page, source, sourceLabel, 'exit', 0);
      });
    }
  }
});

test('preserves text and history when deleting boundaries between every block pair', async({page}) => {
  test.setTimeout(240_000);
  const textContent = (node: JSONContent): string => (
    node.text || node.content?.map(textContent).join('') || ''
  );
  const documentSnapshot = () => page.evaluate(async() => {
    await window.chatInputEditorHarness.resolveAutoCodeLanguages();
    return window.chatInputEditorHarness.document();
  });

  for(const source of BLOCKS) {
    for(const target of BLOCKS) {
      for(const key of ['Backspace', 'Delete']) {
        const active = key === 'Backspace' ? target : source;
        if(active.atomType) continue;
        await test.step(`${key}: ${source.key} → ${target.key}`, async() => {
          const sourceLabel = `source-${source.key}`;
          const targetLabel = `target-${target.key}`;
          expect(await page.evaluate((document) => (
            window.chatInputEditorHarness.setDocument(document)
          ), {
            type: 'doc',
            content: [source.node(sourceLabel), target.node(targetLabel)]
          })).toBe(true);
          await settleNativeSelection(page);
          await setBoundary(
            page,
            active,
            key === 'Backspace' ? targetLabel : sourceLabel,
            key === 'Backspace' ? 'entry' : 'exit',
            0
          );
          const before = await documentSnapshot();
          await page.keyboard.press(key);
          await settleNativeSelection(page);
          const after = await documentSnapshot();
          expect(textContent(after)).toBe(textContent(before));

          if(JSON.stringify(after) !== JSON.stringify(before)) {
            await page.keyboard.press('ControlOrMeta+z');
            await settleNativeSelection(page);
            expect(await documentSnapshot()).toEqual(before);
            await page.keyboard.press('ControlOrMeta+Shift+z');
            await settleNativeSelection(page);
            expect(await documentSnapshot()).toEqual(after);
          }
        });
      }
    }
  }
});

test('repeated list boundary deletion is one native undoable operation', async({page}) => {
  test.setTimeout(120_000);
  const source = BLOCKS.find(block => block.key === 'task-list')!;
  const target = BLOCKS.find(block => block.key === 'ordered-list')!;
  for(let cycle = 0; cycle < 8; ++cycle) for(const key of ['Backspace', 'Delete', 'ControlOrMeta+Backspace', 'ControlOrMeta+Delete'] as const) {
    const backward = key.endsWith('Backspace');
    await page.evaluate(document => window.chatInputEditorHarness.setDocument(document), {
      type: 'doc', content: [source.node('source-task-list'), target.node('target-ordered-list')]
    });
    await settleNativeSelection(page);
    await setBoundary(page, backward ? target : source,
      backward ? 'target-ordered-list' : 'source-task-list',
      backward ? 'entry' : 'exit', 0);
    const before = await page.evaluate(() => window.chatInputEditorHarness.document());
    await page.keyboard.press(key);
    await settleNativeSelection(page);
    const after = await page.evaluate(() => window.chatInputEditorHarness.document());
    if(backward) expect(after.content?.map(node => node.type)).toEqual(['taskList', 'paragraph', 'orderedList']);
    if(JSON.stringify(after) === JSON.stringify(before)) continue;
    await page.keyboard.press('ControlOrMeta+z');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
  }
});
