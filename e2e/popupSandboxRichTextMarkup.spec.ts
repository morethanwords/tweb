import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {JSONContent} from '@tiptap/core';
import type {RichMediaComposerHarness} from './fixtures/richMediaComposer';

declare global {
  interface Window {
    richMediaComposerHarness: RichMediaComposerHarness
  }
}

// Formatting a reader would not see is not offered: a block whose style already draws its text bold
// offers no Bold, an italic one no Italic, and a code block, plain text, nothing at all. What every
// block draws is measured here, over the composer's test article, which holds every kind of block —
// so there is no list of block types to forget one in. The complete field (RichMessageInput), for the
// real tooltip and the real shortcuts.

type Block = {path: string, code: boolean, bold: boolean, italic: boolean, left: number, right: number, y: number};

async function open(page: Page) {
  await page.setViewportSize({width: 1000, height: 900});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async() => {
    const fixture = '/e2e/fixtures/richMediaComposer.ts';
    const testData = '/src/components/chat/inputEditor/testData.ts';
    const [{mountRichMediaComposerHarness}, {createChatInputEditorTestData}] = await Promise.all([
      window.e2eImport(fixture),
      window.e2eImport(testData)
    ]);
    const harness = mountRichMediaComposerHarness();
    harness.setExpanded(true);
    harness.setDocument(createChatInputEditorTestData({includeLocalMediaPreview: false}));
  });
  // the field holds the focus before the first double click: one that is also the click focusing the
  // field was seen to leave a bare caret in Firefox under load
  await page.locator('.input-message-input').focus();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// The text block at `index` (counting those with text), scrolled into view: how its text is drawn —
// the style of the element holding its content, so neither a mark inside nor a node view's frame
// around it — and the first word of its own text, to select. The document is loaded in the task that
// mounts the field, which once kept WebKit redrawing a details forever.
const measure = (page: Page, index: number) => page.evaluate(async(index): Promise<Block | 'none' | 'end'> => {
  const registry = '/src/components/chat/inputEditor/registry.ts';
  const {getChatInputEditor} = await window.e2eImport(registry);
  const input = document.querySelector<HTMLElement>('.input-message-input')!;
  const {view} = getChatInputEditor(input).editor;
  const blocks: {node: any, position: number}[] = [];
  view.state.doc.descendants((node: any, position: number) => {
    if(node.isTextblock && node.textContent.trim()) blocks.push({node, position});
  });
  const block = blocks[index];
  if(!block) return 'end';

  const content = view.domAtPos(block.position + 1).node as HTMLElement;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (text) => /\p{L}{2}/u.test(text.textContent) && !text.parentElement.closest('a, [contenteditable="false"]') ?
      NodeFilter.FILTER_ACCEPT :
      NodeFilter.FILTER_REJECT
  });
  const text = walker.nextNode();
  if(!text) return 'none';
  content.scrollIntoView({block: 'center'});
  const word = /\p{L}+/u.exec(text.textContent);
  const range = document.createRange();
  range.setStart(text, word.index);
  range.setEnd(text, word.index + word[0].length);
  const rect = range.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  // a closed details' body has a size, under what is drawn over it
  if(!rect.width || !content.contains(document.elementFromPoint(rect.left + 1, y))) return 'none';

  const style = getComputedStyle(content);
  const $inside = view.state.doc.resolve(block.position + 1);
  const boldWeight = parseFloat(getComputedStyle(input).getPropertyValue('--font-weight-bold'));
  return {
    path: Array.from({length: $inside.depth}, (_, depth) => $inside.node(depth + 1).type.name).join(' > '),
    code: !!block.node.type.spec.code,
    bold: parseFloat(style.fontWeight) >= boldWeight,
    italic: style.fontStyle === 'italic',
    left: rect.left,
    right: rect.right,
    y
  };
}, index);

const tooltipOffers = (page: Page) => page.evaluate(() => Object.fromEntries(['Bold', 'Italic', 'Quote'].map((label) => {
  const button = document.querySelector<HTMLButtonElement>(`.markup-tooltip.is-visible button[aria-label="${label}"]`);
  return [label, !!button && !button.disabled && !button.classList.contains('is-disabled')];
})));

const editorState = (page: Page) => page.evaluate(async() => {
  const registry = '/src/components/chat/inputEditor/registry.ts';
  const {getChatInputEditor} = await window.e2eImport(registry);
  const editor = getChatInputEditor(document.querySelector<HTMLElement>('.input-message-input')!);
  const {$from, empty} = editor.editor.state.selection;
  return {
    document: JSON.stringify(editor.getDocument()),
    selected: empty ? '' : Array.from({length: $from.depth}, (_, depth) => $from.node(depth + 1).type.name).join(' > ')
  };
});

test('no text block offers a mark its style draws already, from the tooltip or the keyboard', async({page}) => {
  test.setTimeout(180_000);
  await open(page);
  const wrong: string[] = [];
  const seen = new Set<string>();
  for(let index = 0; ; ++index) {
    // where it is once nothing moves any more: a block above may still be settling
    let block = await measure(page, index), previous: typeof block;
    while(JSON.stringify(block) !== JSON.stringify(previous)) {
      previous = block;
      block = await measure(page, index);
    }
    if(block === 'end') break;
    if(block === 'none') continue;

    seen.add(block.path);
    // the first word, double clicked
    await page.mouse.dblclick((block.left + block.right) / 2, block.y);
    // the editor learns of the selection from `selectionchange`, which WebKit sends a moment later
    let selected: string;
    try {
      await expect.poll(async() => selected = (await editorState(page)).selected, {timeout: 2000}).toBe(block.path);
    } catch{
      wrong.push(`${block.path}: a double click selected in ${selected || 'nothing'}`);
      continue;
    }

    const expected = {Bold: !block.code && !block.bold, Italic: !block.code && !block.italic};
    try {
      await expect.poll(() => tooltipOffers(page), {timeout: 3000}).toMatchObject(block.code ? {...expected, Quote: false} : expected);
    } catch{
      wrong.push(`${block.path}${block.bold ? ' (bold)' : ''}${block.italic ? ' (italic)' : ''}: offers ${JSON.stringify(await tooltipOffers(page))}`);
    }

    // a shortcut changes nothing the tooltip does not offer
    for(const [key, drawn] of [['b', block.bold], ['i', block.italic]] as const) {
      if(!drawn && !block.code) continue;
      const before = (await editorState(page)).document;
      await page.keyboard.press(`ControlOrMeta+${key}`);
      if((await editorState(page)).document !== before) wrong.push(`${block.path}: Ctrl+${key.toUpperCase()} changed the text`);
    }
  }

  expect(wrong, `\n${wrong.join('\n')}\n`).toEqual([]);
  // the walk got through the article: its headings, quotes, lists, table, details and code
  expect(seen.size).toBeGreaterThan(12);
});

// The tooltip's Quote wears the plain quote's icon while the field is collapsed: a quote there is the
// one a message has. The expanded field quotes as a block, and so do a pullquote and a quote with an
// author, which the collapsed field keeps as they are.
test('the tooltip quotes with the plain icon in a collapsed field and with the block one otherwise', async({page}) => {
  await page.setViewportSize({width: 1000, height: 900});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  const glyphs = await page.evaluate(async() => {
    const fixture = '/e2e/fixtures/richMediaComposer.ts';
    const iconsPath = '/src/icons.ts';
    const [{mountRichMediaComposerHarness}, {default: icons}] = await Promise.all([
      window.e2eImport(fixture),
      window.e2eImport(iconsPath)
    ]);
    window.richMediaComposerHarness = mountRichMediaComposerHarness();
    const glyph = (icon: string) => String.fromCharCode(parseInt(icons[icon], 16));
    return {[glyph('quote')]: 'quote', [glyph('blockquote')]: 'blockquote'};
  });

  const text = (value: string): JSONContent => ({type: 'text', text: value});
  const paragraph = (value: string): JSONContent => ({type: 'paragraph', content: [text(value)]});
  const cases: {name: string, expanded: boolean, block: JSONContent, icon: string}[] = [
    {name: 'text, collapsed', expanded: false, block: paragraph('Plain words'), icon: 'quote'},
    {name: 'a quote, collapsed', expanded: false, block: {type: 'blockquote', content: [paragraph('Plain words')]}, icon: 'quote'},
    {name: 'a quote with an author, collapsed', expanded: false, block: {type: 'blockquote', content: [
      paragraph('Plain words'),
      {type: 'blockquoteCaption', content: [text('Author')]}
    ]}, icon: 'blockquote'},
    {name: 'a pullquote, collapsed', expanded: false, block: {type: 'pullquote', content: [
      {type: 'pullquoteText', content: [text('Plain words')]},
      {type: 'pullquoteCaption', content: [text('Author')]}
    ]}, icon: 'blockquote'},
    {name: 'text, expanded', expanded: true, block: paragraph('Plain words'), icon: 'blockquote'},
    {name: 'a quote, expanded', expanded: true, block: {type: 'blockquote', content: [paragraph('Plain words')]}, icon: 'blockquote'}
  ];

  const wrong: string[] = [];
  for(const {name, expanded, block, icon} of cases) {
    await page.keyboard.press('Escape');
    await expect(page.locator('.markup-tooltip.is-visible')).toHaveCount(0);
    await page.evaluate(({expanded, block}) => {
      const harness = window.richMediaComposerHarness;
      harness.setExpanded(expanded);
      harness.setDocument({type: 'doc', content: [block]});
    }, {expanded, block});
    // where the word is once nothing moves any more: a block's node view may still be settling
    const measureWord = () => page.evaluate(() => {
      const input = document.querySelector<HTMLElement>('.input-message-input')!;
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
      for(let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.textContent.indexOf('Plain');
        if(index === -1) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 5);
        const rect = range.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
      }
    });
    let word = await measureWord(), previous: typeof word;
    while(JSON.stringify(word) !== JSON.stringify(previous)) {
      previous = word;
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      word = await measureWord();
    }
    if(!word) {
      wrong.push(`${name}: the text is not drawn`);
      continue;
    }

    // a caret first: the word the last case selected sits where this one's does, and selecting it
    // again would change no selection to show the tooltip for
    await page.mouse.click(word.x, word.y);
    await expect(page.locator('.markup-tooltip.is-visible')).toHaveCount(0);
    await page.mouse.dblclick(word.x, word.y);
    const shown = () => page.evaluate(() => document.querySelector(
      '.markup-tooltip.is-visible button[aria-label="Quote"] .button-icon'
    )?.textContent);
    try {
      await expect.poll(async() => glyphs[await shown()], {timeout: 3000}).toBe(icon);
    } catch{
      wrong.push(`${name}: ${glyphs[await shown()] || 'no tooltip'} instead of ${icon}`);
    }
  }

  expect(wrong, `\n${wrong.join('\n')}\n`).toEqual([]);
});
