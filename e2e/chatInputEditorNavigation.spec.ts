import {openEditor, settleNativeSelection as settleSelection} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import type {
  ChatInputEditorBrowserHarness
} from './fixtures/chatInputEditor';
import {chatInputEditorArticle} from './fixtures/chatInputEditorArticle';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

function tableBlock(rows: string[][]): JSONContent {
  return {
    type: 'chatTableWrapper',
    content: [{type: 'chatTableTitle'}, {
      type: 'table',
      content: rows.map((row) => ({
        type: 'tableRow',
        content: row.map((text) => ({
          type: 'tableCell',
          content: [{
            type: 'paragraph',
            content: text ? [{type: 'text', text}] : undefined
          }]
        }))
      }))
    }]
  };
}

function detailsBlock(title = 'Details', body = ''): JSONContent {
  return {
    type: 'details',
    attrs: {open: true},
    content: [
      {
        type: 'detailsSummary',
        content: title ? [{type: 'text', text: title}] : undefined
      },
      {
        type: 'detailsBody',
        content: [{
          type: 'paragraph',
          content: body ? [{type: 'text', text: body}] : undefined
        }]
      }
    ]
  };
}

function articleMediaBlock() {
  const media = chatInputEditorArticle().content
  ?.find((node) => node.type === 'richMedia');
  if(!media) throw new Error('The editor test article must contain rich media');
  return media;
}

async function setDocument(page: Page, content: JSONContent[]) {
  expect(await page.evaluate((content) => (
    window.chatInputEditorHarness.setDocument({type: 'doc', content})
  ), content)).toBe(true);
}

async function domCell(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ?
      anchor as Element :
      anchor?.parentElement;
    const cell = element?.closest<HTMLTableCellElement>('td, th');
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest('table');
    return cell && row && table ? {
      column: cell.cellIndex,
      columns: row.cells.length,
      row: row.rowIndex,
      rows: table.rows.length
    } : undefined;
  });
}

async function constrainEditorBetweenToolbars(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    const surface = editor.parentElement!;
    const wrapper = document.createElement('div');
    wrapper.className = 'new-message-wrapper is-expanded';
    Object.assign(wrapper.style, {
      height: '240px',
      overflow: 'hidden',
      position: 'relative',
      width: '100%'
    });
    const topToolbar = document.createElement('div');
    topToolbar.className = 'message-input-editor-toolbar-top';
    const bottomToolbar = document.createElement('div');
    bottomToolbar.className = 'message-input-editor-toolbar-bottom';
    [topToolbar, bottomToolbar].forEach((toolbar) => Object.assign(toolbar.style, {
      display: 'block',
      height: '48px',
      left: '0',
      position: 'absolute',
      right: '0',
      zIndex: '1'
    }));
    topToolbar.style.top = '0';
    bottomToolbar.style.bottom = '0';
    Object.assign(editor.style, {
      height: '240px',
      maxHeight: '240px',
      overflowY: 'auto',
      paddingBottom: '56px',
      paddingTop: '56px'
    });
    wrapper.append(topToolbar, editor, bottomToolbar);
    surface.replaceChildren(wrapper);
  });
}

async function insertStructuralBlockAtBottom(
  page: Page,
  type: Parameters<ChatInputEditorBrowserHarness['insertStructuralBlock']>[0]
) {
  return page.evaluate(async(type) => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    editor.scrollTop = editor.scrollHeight;
    const samples = [editor.scrollTop];
    const inserted = window.chatInputEditorHarness.insertStructuralBlock(type);
    samples.push(editor.scrollTop);
    for(let frame = 0; frame < 3; ++frame) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(editor.scrollTop);
    }
    return {inserted, samples};
  }, type);
}

async function caretVisibility(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    const wrapper = editor.closest<HTMLElement>('.new-message-wrapper')!;
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    let caret = range.getBoundingClientRect();
    if(caret.top === 0 && caret.bottom === 0) {
      const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ?
        selection.anchorNode as Element :
        selection.anchorNode?.parentElement;
      const textblock = anchor?.closest<HTMLElement>(
        '.chat-input-trailing-placeholder'
      );
      if(textblock) caret = textblock.getBoundingClientRect();
    }
    const editorRect = editor.getBoundingClientRect();
    const style = getComputedStyle(editor);
    const topToolbar = wrapper.querySelector<HTMLElement>(
      '.message-input-editor-toolbar-top'
    )!.getBoundingClientRect();
    const bottomToolbar = wrapper.querySelector<HTMLElement>(
      '.message-input-editor-toolbar-bottom'
    )!.getBoundingClientRect();
    return {
      bottom: caret.bottom,
      scrollTop: editor.scrollTop,
      top: caret.top,
      visibleBottom: Math.min(
        editorRect.bottom - parseFloat(style.paddingBottom),
        bottomToolbar.top
      ),
      visibleTop: Math.max(
        editorRect.top + parseFloat(style.paddingTop),
        topToolbar.bottom
      )
    };
  });
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('ArrowLeft from a Details title enters the previous table last cell', async({page}) => {
  await setDocument(page, [
    tableBlock([
      ['First', 'Second'],
      ['Third', 'Last']
    ]),
    detailsBlock('Title')
  ]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('detailsSummary')
  ))).toBe(true);

  await page.keyboard.press('ArrowLeft');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('tableCell');
  expect(selection.text).toBe('Last');
  expect(selection.parentOffset).toBe('Last'.length);
  expect(await domCell(page)).toEqual({column: 1, columns: 2, row: 1, rows: 2});
});

test('ArrowLeft at the start of Details body never jumps to the trailing placeholder', async({page}) => {
  await setDocument(page, [
    tableBlock([['Table']]),
    detailsBlock('Title')
  ]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('paragraph', 1)
  ))).toBe(true);

  await page.keyboard.press('ArrowLeft');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('details');
  expect(selection.path).not.toContain('tableCell');
});

test('ArrowDown from a Details title enters its body', async({page}) => {
  await setDocument(page, [detailsBlock('Title')]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('detailsSummary', 0, 'end')
  ))).toBe(true);

  await page.keyboard.press('ArrowDown');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('detailsBody');
  expect(selection.path[selection.path.length - 1]).toBe('paragraph');
});

test('ArrowUp from the trailing placeholder enters the preceding Details body', async({page}) => {
  await setDocument(page, [
    {type: 'paragraph', content: [{type: 'text', text: 'Text'}]},
    tableBlock([['Table']]),
    detailsBlock('Title')
  ]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);

  await page.keyboard.press('ArrowUp');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('detailsBody');
  expect(selection.path[selection.path.length - 1]).toBe('paragraph');
});

test('ArrowLeft from the trailing placeholder enters the table last cell', async({page}) => {
  await setDocument(page, [tableBlock([
    ['First', 'Second'],
    ['Third', 'Last']
  ])]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);

  await page.keyboard.press('ArrowLeft');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('tableCell');
  expect(selection.text).toBe('Last');
  expect(await domCell(page)).toEqual({column: 1, columns: 2, row: 1, rows: 2});
});

test('Backspace and ArrowUp from the trailing placeholder stop on a divider', async({page}) => {
  await setDocument(page, [
    {type: 'paragraph', content: [{type: 'text', text: 'Before divider'}]},
    {type: 'richDivider'}
  ]);

  for(const key of ['Backspace', 'ArrowUp']) {
    expect(await page.evaluate(() => (
      window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
    ))).toBe(true);
    await page.keyboard.press(key);
    await settleSelection(page);
    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('node');
    expect(selection.nodeType).toBe('richDivider');
  }
});

test('structural inserts at the bottom produce at most one scroll movement', async({page}) => {
  await constrainEditorBetweenToolbars(page);
  await page.evaluate(() => window.chatInputEditorHarness.setExpanded(true));
  const types = [
    'divider',
    'footer',
    'details',
    'code',
    'blockMath',
    'table',
    'media'
  ] as const;

  for(const type of types) {
    await test.step(type, async() => {
      await setDocument(page, Array.from({length: 18}, (_value, index) => ({
        type: 'paragraph',
        content: [{type: 'text', text: `Line ${index + 1}`}]
      })));
      expect(await page.evaluate(() => (
        window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
      ))).toBe(true);

      const {inserted, samples} = await insertStructuralBlockAtBottom(page, type);
      expect(inserted).toBe(true);
      const movementThreshold = type === 'divider' ? .5 : 1.5;
      const movements = samples.slice(1).filter((value, index) => (
        Math.abs(value - samples[index]) > movementThreshold
      ));
      expect(movements, `${type}: ${samples.join(' → ')}`).toHaveLength(1);
    });
  }
});

test('table insertion away from the bottom reveals its leading edge immediately', async({page}) => {
  await constrainEditorBetweenToolbars(page);
  await page.evaluate(() => window.chatInputEditorHarness.setExpanded(true));
  await setDocument(page, Array.from({length: 30}, (_value, index) => ({
    type: 'paragraph',
    content: [{type: 'text', text: `Line ${index + 1}`}]
  })));
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTextblock(12, 'end')
  ))).toBe(true);

  const result = await page.evaluate(async() => {
    const editor = document.querySelector<HTMLElement>('#editor')!;
    const wrapper = editor.closest<HTMLElement>('.new-message-wrapper')!;
    const selection = document.getSelection()!;
    const caret = selection.getRangeAt(0).getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    editor.scrollTop += caret.top - editorRect.top - 120;
    const before = editor.scrollTop;
    const inserted = window.chatInputEditorHarness.insertStructuralBlock('table');
    const immediate = editor.scrollTop;
    const measure = () => {
      const table = editor.querySelector<HTMLElement>('.chat-input-table-block')!;
      const editorRect = editor.getBoundingClientRect();
      const style = getComputedStyle(editor);
      const topToolbar = wrapper.querySelector<HTMLElement>(
        '.message-input-editor-toolbar-top'
      )!.getBoundingClientRect();
      const bottomToolbar = wrapper.querySelector<HTMLElement>(
        '.message-input-editor-toolbar-bottom'
      )!.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      return {
        tableBottom: tableRect.bottom,
        tableHeight: tableRect.height,
        tableTop: tableRect.top,
        visibleBottom: Math.min(
          editorRect.bottom - parseFloat(style.paddingBottom),
          bottomToolbar.top
        ),
        visibleTop: Math.max(
          editorRect.top + parseFloat(style.paddingTop),
          topToolbar.bottom
        )
      };
    };
    const immediateLayout = measure();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      afterFrame: editor.scrollTop,
      before,
      immediate,
      immediateLayout,
      inserted
    };
  });

  expect(result.inserted).toBe(true);
  expect(result.immediate).toBeGreaterThan(result.before);
  expect(result.afterFrame).toBeCloseTo(result.immediate, 1);
  const visibleHeight = (
    result.immediateLayout.visibleBottom - result.immediateLayout.visibleTop
  );
  if(result.immediateLayout.tableHeight <= visibleHeight) {
    expect(result.immediateLayout.tableTop)
    .toBeGreaterThanOrEqual(result.immediateLayout.visibleTop - 1);
    expect(result.immediateLayout.tableBottom)
    .toBeLessThanOrEqual(result.immediateLayout.visibleBottom + 1);
  } else {
    expect(result.immediateLayout.tableTop)
    .toBeCloseTo(result.immediateLayout.visibleTop, 0);
    expect(result.immediateLayout.tableBottom)
    .toBeGreaterThan(result.immediateLayout.visibleBottom);
  }
});

test('ArrowLeft after a hard break stays in its paragraph', async({page}) => {
  await setDocument(page, [{
    type: 'paragraph',
    content: [
      {type: 'text', text: 'Text'},
      {type: 'hardBreak'}
    ]
  }]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('paragraph', 0, 'end')
  ))).toBe(true);
  const before = await page.evaluate(() => window.chatInputEditorHarness.selection());

  await page.keyboard.press('ArrowLeft');

  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path[selection.path.length - 1]).toBe('paragraph');
  expect(selection.from).toBe(before.from - 1);
});

test('ArrowDown and ArrowUp keep the caret between expanded editor toolbars', async({page}) => {
  await constrainEditorBetweenToolbars(page);
  await setDocument(page, Array.from({length: 30}, (_value, index) => ({
    type: 'paragraph',
    content: [{type: 'text', text: `Line ${index + 1}`}]
  })));
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTextblock(0, 'start')
  ))).toBe(true);

  for(let index = 0; index < 20; ++index) await page.keyboard.press('ArrowDown');
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const afterDown = await caretVisibility(page);
  expect(afterDown.scrollTop).toBeGreaterThan(0);
  expect(afterDown.top).toBeGreaterThanOrEqual(afterDown.visibleTop - 1);
  expect(afterDown.bottom).toBeLessThanOrEqual(afterDown.visibleBottom + 1);

  for(let index = 0; index < 20; ++index) await page.keyboard.press('ArrowUp');
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const afterUp = await caretVisibility(page);
  expect(afterUp.top).toBeGreaterThanOrEqual(afterUp.visibleTop - 1);
  expect(afterUp.bottom).toBeLessThanOrEqual(afterUp.visibleBottom + 1);
});

test('ArrowDown from an empty media caption fully reveals the trailing placeholder', async({page}) => {
  const media = articleMediaBlock();
  await constrainEditorBetweenToolbars(page);
  await setDocument(page, [
    ...Array.from({length: 8}, (_value, index) => ({
      type: 'paragraph',
      content: [{type: 'text', text: `Line ${index + 1}`}]
    })),
    {...media, content: undefined}
  ]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);

  await page.keyboard.press('ArrowUp');
  await settleSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('richMedia');
  expect(selection.text).toBe('');
  const afterUp = await caretVisibility(page);

  await page.keyboard.press('ArrowDown');
  await settleSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path[selection.path.length - 1]).toBe('paragraph');
  expect(selection.text).toBe('');
  const afterDown = await caretVisibility(page);
  expect(afterDown.scrollTop).toBeGreaterThanOrEqual(afterUp.scrollTop);
  expect(afterDown.top).toBeGreaterThanOrEqual(afterDown.visibleTop - 1);
  expect(afterDown.bottom).toBeLessThanOrEqual(afterDown.visibleBottom + 1);
});

test('ArrowDown does not skip an empty media caption after a divider', async({page}) => {
  await setDocument(page, [
    {type: 'richDivider'},
    {type: 'paragraph', content: [{type: 'text', text: 'Final paragraph'}]},
    {...articleMediaBlock(), content: undefined}
  ]);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await settleSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('node');
  expect(selection.nodeType).toBe('richDivider');

  await page.keyboard.press('ArrowDown');
  await settleSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path[selection.path.length - 1]).toBe('paragraph');
  expect(selection.text).toBe('Final paragraph');

  await page.keyboard.press('ArrowDown');
  await settleSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('richMedia');
  expect(selection.text).toBe('');
});
