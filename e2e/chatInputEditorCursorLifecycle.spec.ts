import {openEditor, settleNativeSelection, setEditorDocument as setDocument} from './fixtures/chatInputEditorTest';
import {devices, expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import {CHAT_INPUT_EDITOR_TEST_MEDIA_URL} from '@components/chat/inputEditor/testData';
import type {ChatInputEditorBrowserHarness, TextblockDescriptor} from './fixtures/chatInputEditor';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness,
    e2eMediaCaption?: Element,
    e2eMediaItem?: Element,
    e2eMediaRoot?: Element
  }
}

const text = (value: string): JSONContent => ({type: 'text', text: value});
const paragraph = (value = ''): JSONContent => ({
  type: 'paragraph',
  content: value ? [text(value)] : undefined
});

const BACKSPACE_SOURCES = ['keyboard', 'beforeinput', 'virtual'] as const;

async function pressEditorBackspace(page: Page, source: typeof BACKSPACE_SOURCES[number]) {
  if(source === 'keyboard') await page.keyboard.press('Backspace');
  else if(source === 'virtual') expect(await page.evaluate(() => window.chatInputEditorHarness.deleteBackward())).toBe(true);
  else expect(await page.locator('#editor').evaluate((element) => {
    const event = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'deleteContentBackward'});
    element.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await settleNativeSelection(page);
}

async function blocks(page: Page) {
  return page.evaluate(() => window.chatInputEditorHarness.textblocks());
}

function blockIndex(descriptors: TextblockDescriptor[], value: string) {
  const index = descriptors.findIndex(({text}) => text === value);
  expect(index, `Missing lifecycle textblock ${JSON.stringify(value)}`)
  .toBeGreaterThanOrEqual(0);
  return index;
}

async function setCaret(
  page: Page,
  descriptors: TextblockDescriptor[],
  value: string,
  edge: 'end' | 'start' | number
) {
  expect(await page.evaluate(({edge, index}) => (
    window.chatInputEditorHarness.setCaretInTextblock(index, edge)
  ), {edge, index: blockIndex(descriptors, value)})).toBe(true);
}

async function platformShortcut(page: Page, key: string) {
  const modifier = await page.evaluate(() => (
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Meta' : 'Control'
  ));
  return `${modifier}+${key}`;
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('keeps list, code, quote and Details Enter transitions structurally valid', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [{type: 'listItem', content: [paragraph('Item')]}]
    }]
  });
  let descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Item', 'end');
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('listItem')))
  .toHaveLength(2);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe('');
  expect(selection.path).toContain('listItem');

  await setDocument(page, {
    type: 'doc',
    content: [{type: 'codeBlock', attrs: {language: ''}, content: [text('code')]}, paragraph('After')]
  });
  descriptors = await blocks(page);
  await setCaret(page, descriptors, 'code', 'end');
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('codeBlock');
  expect(selection.text).toBe('code\n');
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).text)
  .toBe('After');

  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'blockquote',
      content: [paragraph('Quote')]
    }]
  });
  descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Quote', 'end');
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('blockquote');
  expect(selection.text).toBe('Quote');
  expect(selection.parentOffset).toBeGreaterThan('Quote'.length);
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).not.toContain('blockquote');

  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'details',
      attrs: {open: false},
      content: [
        {type: 'detailsSummary', content: [text('Details')]},
        {type: 'detailsBody', content: [paragraph()]}
      ]
    }]
  });
  descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Details', 'end');
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('detailsBody');
  expect(selection.text).toBe('');
  expect(await page.locator('[data-rich-message-details]').getAttribute('data-editor-open'))
  .toBe('true');
});

test('inserts line breaks into Pullquote and exits only after an empty line', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'pullquote',
      content: [{type: 'pullquoteText', content: [text('First')]}]
    }]
  });
  let descriptors = await blocks(page);
  await setCaret(page, descriptors, 'First', 'end');

  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('pullquoteText');
  expect(selection.parentOffset).toBe('First'.length + 1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('hardBreak')))
  .toHaveLength(1);

  await page.keyboard.insertText('Second');
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).toContain('pullquoteText');
  expect(selection.text).toBe('FirstSecond');
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('hardBreak')))
  .toHaveLength(2);

  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.path).not.toContain('pullquote');
  expect(selection.text).toBe('');
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('hardBreak')))
  .toHaveLength(1);

  descriptors = await blocks(page);
  expect(descriptors.some(({path, text}) => (
    path.includes('pullquoteText') && text === 'FirstSecond'
  ))).toBe(true);
});

test('moves a body caret to the summary when Details is collapsed', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'details',
      attrs: {open: true},
      content: [
        {type: 'detailsSummary', content: [text('Summary')]},
        {type: 'detailsBody', content: [paragraph('Body')]}
      ]
    }]
  });
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Body', 2);
  await page.locator('.chat-input-details-toggle').click();
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe('Summary');
  expect(selection.parentOffset).toBe('Summary'.length);
  expect(await page.locator('[data-rich-message-details]').getAttribute('data-editor-open'))
  .toBe('false');
});

test('undo and redo map both content and caret through a browser typing transaction', async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph('AB')]});
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'AB', 1);
  await page.keyboard.insertText('X');
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('AXB');
  expect(selection.parentOffset).toBe(2);

  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('AB');
  expect(selection.parentOffset).toBe(1);

  await page.keyboard.press(await platformShortcut(page, 'Shift+Z'));
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('AXB');
  expect(selection.parentOffset).toBe(2);
});

for(const remount of [false, true]) {
  test(`preserves Select All over leading atoms through ${remount ? 'editor remount' : 'toolbar restore'}`, async({page}) => {
    const document: JSONContent = {
      type: 'doc',
      content: [{type: 'richDivider'}, paragraph('Body'), {type: 'richDivider'}]
    };
    await setDocument(page, document);
    const descriptors = await blocks(page);
    await setCaret(page, descriptors, 'Body', 2);
    await page.keyboard.press(await platformShortcut(page, 'A'));
    await settleNativeSelection(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type).toBe('all');

    await page.evaluate((remount) => window.chatInputEditorHarness.roundTripSelection(remount), remount);
    await settleNativeSelection(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type).toBe('all');
    await page.keyboard.press('Backspace');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({
      type: 'doc', content: [paragraph()]
    });
    await page.keyboard.press(await platformShortcut(page, 'Z'));
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(document);
  });

  test(`preserves backward native selection through ${remount ? 'editor remount' : 'toolbar restore'}`, async({page}) => {
    await setDocument(page, {type: 'doc', content: [paragraph('abcdef')]});
    const descriptors = await blocks(page);
    await setCaret(page, descriptors, 'abcdef', 6);
    for(let index = 0; index < 4; ++index) await page.keyboard.press('Shift+ArrowLeft');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('cdef');

    await page.evaluate((remount) => window.chatInputEditorHarness.roundTripSelection(remount), remount);
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('cdef');
    await page.keyboard.press('Shift+ArrowLeft');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('bcdef');
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({
      type: 'doc', content: [paragraph('abcdef')]
    });
  });
}

for(const source of ['virtual', 'beforeinput']) test(`${source} Backspace navigates empty table surfaces and deletes an explicitly selected table`, async({page}) => {
  const backspace = () => source === 'virtual' ?
    page.evaluate(() => window.chatInputEditorHarness.deleteBackward()) :
    page.locator('#editor').evaluate((element) => {
      const event = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'deleteContentBackward'});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await setDocument(page, {type: 'doc', content: [paragraph()]});
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertStructuralBlock('table'))).toBe(true);
  const before = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0, 0))).toBe(true);

  expect(await backspace()).toBe(true);
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).path).toContain('chatTableTitle');
  expect(await backspace()).toBe(true);
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type).toBe('cell');
  expect(await backspace()).toBe(true);
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({type: 'doc', content: [paragraph()]});

  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
});

test('virtual Backspace deletes inline math like the native keyboard and can undo it', async({page}) => {
  const document: JSONContent = {
    type: 'doc',
    content: [{type: 'paragraph', content: [text('A'), {type: 'inlineMath', attrs: {source: 'x'}}, text('B')]}]
  };
  for(const virtual of [false, true]) {
    await setDocument(page, document);
    expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0, 2))).toBe(true);
    if(virtual) expect(await page.evaluate(() => window.chatInputEditorHarness.deleteBackward())).toBe(true);
    else await page.keyboard.press('Backspace');
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({type: 'doc', content: [paragraph('AB')]});
    await page.keyboard.press(await platformShortcut(page, 'Z'));
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(document);
  }
});

for(const source of BACKSPACE_SOURCES) for(const caption of ['', 'Caption']) test(`${source} Backspace removes the added empty paragraph after media (caption=${JSON.stringify(caption)})`, async({page}) => {
  expect(await page.evaluate((url) => window.chatInputEditorHarness.insertTestPhoto(url), CHAT_INPUT_EDITOR_TEST_MEDIA_URL)).toBe(true);
  if(caption) {
    await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('richMedia', 0, 'end'));
    await page.keyboard.type(caption);
    await settleNativeSelection(page);
  }
  const original = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInTrailingPlaceholder())).toBe(true);
  await page.keyboard.press('Enter');
  await settleNativeSelection(page);
  const paragraphs = page.locator('#editor > [data-chat-input-paragraph]');
  await expect(paragraphs).toHaveCount(2);
  const withEmptyParagraph = await page.evaluate(() => window.chatInputEditorHarness.document());
  await paragraphs.first().click();
  await settleNativeSelection(page);
  // Test Undo/Redo of this deletion independently of the preceding Enter.
  await page.evaluate(() => window.chatInputEditorHarness.separateHistory());
  await pressEditorBackspace(page, source);

  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
  await expect(paragraphs).toHaveCount(1);
  await expect(page.locator('#editor > .chat-input-trailing-placeholder')).toHaveCount(1);
  await expect(page.locator('.chat-input-rich-media.ProseMirror-selectednode')).toHaveCount(0);
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({type: 'text', parentOffset: caption.length, path: expect.arrayContaining(['richMedia'])});
  expect(await page.evaluate(() => document.querySelector('.chat-input-rich-media-caption [data-placeholder]')!.contains(window.getSelection()!.anchorNode))).toBe(true);

  if(source === 'virtual') expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
  else await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(withEmptyParagraph);
  await expect(paragraphs).toHaveCount(2);
  expect(await page.evaluate(() => {
    const first = document.querySelector('#editor > [data-chat-input-paragraph]')!;
    return first.contains(window.getSelection()!.anchorNode) && window.getSelection()!.isCollapsed;
  })).toBe(true);
  if(source === 'virtual') expect(await page.evaluate(() => window.chatInputEditorHarness.redo())).toBe(true);
  else await page.keyboard.press(await platformShortcut(page, 'Shift+Z'));
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
  await expect(paragraphs).toHaveCount(1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({type: 'text', parentOffset: caption.length, path: expect.arrayContaining(['richMedia'])});
});

for(const source of BACKSPACE_SOURCES) for(const caption of ['empty', 'text', 'credit']) {
  test(`${source} Backspace enters the ${caption} media caption from the final placeholder`, async({page}) => {
    expect(await page.evaluate((url) => window.chatInputEditorHarness.insertTestPhoto(url), CHAT_INPUT_EDITOR_TEST_MEDIA_URL)).toBe(true);
    const sourceDocument = await page.evaluate(() => window.chatInputEditorHarness.document());
    if(caption === 'text') sourceDocument.content![0].content = [{type: 'text', text: 'A😀B', marks: [{type: 'bold'}]}];
    if(caption === 'credit') sourceDocument.content![0].attrs!.captionCredit = {_: 'textPlain', text: 'Credit'};
    await setDocument(page, sourceDocument);
    const original = await page.evaluate(() => window.chatInputEditorHarness.document());
    await page.evaluate(() => {
      window.e2eMediaRoot = document.querySelector('.chat-input-rich-media')!;
      window.chatInputEditorHarness.setCaretInTrailingPlaceholder();
    });
    await settleNativeSelection(page);
    await pressEditorBackspace(page, source);
    const offset = caption === 'text' ? 'A😀B'.length : 0;
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
    expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({
      type: 'text', parentOffset: offset, path: expect.arrayContaining(['richMedia'])
    });
    expect(await page.evaluate(() => {
      const caption = document.querySelector('.chat-input-rich-media-caption [data-placeholder]')!;
      const selection = window.getSelection()!;
      return selection.isCollapsed && caption.contains(selection.anchorNode) &&
        document.querySelector('.chat-input-rich-media') === window.e2eMediaRoot;
    })).toBe(true);
    await expect(page.locator('.chat-input-rich-media.ProseMirror-selectednode')).toHaveCount(0);
    await expect(page.locator('#editor > .chat-input-trailing-placeholder')).toHaveCount(1);
    expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(false);

    // Synthetic beforeinput has no browser default action for ordinary text.
    await pressEditorBackspace(page, caption === 'text' && source === 'beforeinput' ? 'keyboard' : source);
    if(caption === 'text') {
      expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content)
      .toEqual([{type: 'text', text: 'A😀', marks: [{type: 'bold'}]}]);
    } else await expect(page.locator('.chat-input-rich-media')).toHaveCount(0);
    expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
    await settleNativeSelection(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
    expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({
      type: 'text', parentOffset: offset, path: expect.arrayContaining(['richMedia'])
    });
  });
}

test('virtual Backspace leaves readonly content unchanged', async({page}) => {
  const document: JSONContent = {type: 'doc', content: [paragraph('Readonly')]};
  await setDocument(page, document);
  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0, 'end'))).toBe(true);
  await page.evaluate(() => window.chatInputEditorHarness.setEditable(false));
  expect(await page.evaluate(() => window.chatInputEditorHarness.deleteBackward())).toBe(false);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(document);
});

test('keeps a managed local media preview resolvable across repeated editor remounts', async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph()]});
  const url = await page.evaluate((url) => window.chatInputEditorHarness.insertOwnedTestPhoto(url), CHAT_INPUT_EDITOR_TEST_MEDIA_URL);
  expect(url).toBeTruthy();
  const image = page.locator('.chat-input-rich-media').getByRole('img', {name: 'Photo', exact: true});
  const hasBitmap = () => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0);
  await expect.poll(hasBitmap).toBe(true);

  for(let count = 0; count < 3; ++count) {
    await page.evaluate(() => window.chatInputEditorHarness.roundTripSelection(true));
    await settleNativeSelection(page);
    expect(await page.evaluate(async(url) => (await fetch(url!)).ok, url)).toBe(true);
    await expect.poll(hasBitmap).toBe(true);
  }

  await page.evaluate(() => window.chatInputEditorHarness.destroy());
  expect(await page.evaluate(async(url) => {
    try {
      await fetch(url!);
      return true;
    } catch{
      return false;
    }
  }, url)).toBe(false);
});

test('keeps insertion targets valid when the background highlighter detects a language', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'codeBlock',
      attrs: {language: ''},
      content: [text('const auditSelectionTarget = 42;')]
    }]
  });
  const revision = await page.evaluate(() => window.chatInputEditorHarness.revision());
  await expect.poll(() => page.evaluate(() => (
    window.chatInputEditorHarness.document().content?.[0].attrs?.detectedLanguage
  ))).toBe('JavaScript');
  expect(await page.evaluate(() => window.chatInputEditorHarness.revision())).toBe(revision);

  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'const auditSelectionTarget = 42;', 0);
  await page.keyboard.insertText('// ');
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.revision())).toBeGreaterThan(revision!);
});

test('keeps content and caret coherent during a composition lifecycle', async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph('AB')]});
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'AB', 1);

  await page.locator('#editor').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      data: ''
    }));
  });
  expect(await page.evaluate(() => window.chatInputEditorHarness.isComposing()))
  .toBe(true);

  await page.keyboard.insertText('日本');
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('A日本B');
  expect(selection.parentOffset).toBe(3);

  await page.locator('#editor').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '日本'
    }));
  });
  expect(await page.evaluate(() => window.chatInputEditorHarness.isComposing()))
  .toBe(false);

  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('AB');
  expect(selection.parentOffset).toBe(1);
});

for(const requestDuringComposition of [false, true]) test(`commits the final IME mutation before remounting (${requestDuringComposition ? 'during' : 'after'} composition)`, async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph('AB')]});
  await setCaret(page, await blocks(page), 'AB', 1);
  const generation = await page.evaluate(() => window.chatInputEditorHarness.generation());
  await page.locator('#editor').evaluate((element, requestDuringComposition) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
    if(requestDuringComposition) window.chatInputEditorHarness.roundTripSelection(true);
    const node = document.getSelection()!.anchorNode!;
    node.nodeValue = 'A日本B';
    document.getSelection()!.setBaseAndExtent(node, 3, node, 3);
    element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '日本'}));
    if(!requestDuringComposition) window.chatInputEditorHarness.roundTripSelection(true);
  }, requestDuringComposition);
  await expect.poll(() => page.evaluate(() => window.chatInputEditorHarness.generation())).toBe(generation + 1);
  await settleNativeSelection(page);
  await expect.poll(() => page.evaluate(() => window.chatInputEditorHarness.selection().text))
  .toBe('A日本B');
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).parentOffset).toBe(3);
});

test('undoes and redoes multiple IME updates as one committed input', async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph('AB')]});
  await setCaret(page, await blocks(page), 'AB', 1);
  await page.locator('#editor').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
  });
  for(const value of ['n', 'に', '日本']) {
    await page.locator('#editor').evaluate((element, value) => {
      const node = document.getSelection()!.anchorNode!;
      node.nodeValue = `A${value}B`;
      document.getSelection()!.setBaseAndExtent(node, value.length + 1, node, value.length + 1);
      element.dispatchEvent(new CompositionEvent('compositionupdate', {bubbles: true, data: value}));
    }, value);
    await settleNativeSelection(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).text).toBe(`A${value}B`);
  }
  await page.locator('#editor').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '日本'}));
  });
  await settleNativeSelection(page);
  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).text).toBe('AB');
  await page.keyboard.press(await platformShortcut(page, 'Shift+Z'));
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('A日本B');
  expect(selection.parentOffset).toBe(3);
});

test('preserves a media caption caret and NodeView across asynchronous updates', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [
      paragraph('Before'),
      {
        type: 'richMedia',
        attrs: {
          block: {
            _: 'pageBlockPhoto',
            pFlags: {},
            photo_id: 'upload-upload-1-0',
            caption: {
              _: 'pageCaption',
              credit: {_: 'richTextEmpty'},
              text: {_: 'richTextEmpty'}
            }
          },
          captionCredit: null,
          uploadAction: '',
          uploadActiveIndex: -1,
          uploadGrouped: false,
          uploadId: 'upload-1',
          uploadItems: [{
            id: 'item-1',
            progress: 0.25,
            state: 'uploading',
            type: 'photo'
          }],
          uploadPreviewUrls: ['']
        },
        content: [text('Caption')]
      },
      paragraph('After')
    ]
  });
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'Caption', 3);
  await page.locator('.chat-input-rich-media').evaluate((element) => {
    window.e2eMediaRoot = element;
    window.e2eMediaCaption = element.querySelector('.chat-input-rich-media-caption')!;
    window.e2eMediaItem = element.querySelector('.chat-input-rich-media-item')!;
  });

  await page.evaluate(() => new Promise<void>((resolve) => {
    setTimeout(() => {
      window.chatInputEditorHarness.setNodeAttributes('richMedia', 0, {
        uploadItems: [{
          id: 'item-1',
          progress: 0.75,
          state: 'uploading',
          type: 'photo'
        }]
      });
      resolve();
    }, 0);
  }));
  await settleNativeSelection(page);

  const nodeViewIdentity = await page.evaluate(() => ({
    captionConnected: !!window.e2eMediaCaption?.isConnected,
    captionSame: window.e2eMediaCaption === document.querySelector(
      '.chat-input-rich-media-caption'
    ),
    itemConnected: !!window.e2eMediaItem?.isConnected,
    itemSame: window.e2eMediaItem === document.querySelector(
      '.chat-input-rich-media-item'
    ),
    rootConnected: !!window.e2eMediaRoot?.isConnected,
    rootSame: window.e2eMediaRoot === document.querySelector('.chat-input-rich-media')
  }));
  expect(nodeViewIdentity).toEqual({
    captionConnected: true,
    captionSame: true,
    itemConnected: true,
    itemSame: true,
    rootConnected: true,
    rootSame: true
  });
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('Caption');
  expect(selection.parentOffset).toBe(3);

  await page.keyboard.insertText('X');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('CapXtion');
  expect(selection.parentOffset).toBe(4);
  expect(await page.evaluate(() => (
    window.e2eMediaRoot === document.querySelector('.chat-input-rich-media') &&
    window.e2eMediaCaption === document.querySelector('.chat-input-rich-media-caption') &&
    window.e2eMediaItem === document.querySelector('.chat-input-rich-media-item')
  ))).toBe(true);
});

test('keeps native word navigation distinct from character navigation', async({page}) => {
  await setDocument(page, {type: 'doc', content: [paragraph('one two three')]});
  const descriptors = await blocks(page);
  const block = descriptors[blockIndex(descriptors, 'one two three')];
  await setCaret(page, descriptors, 'one two three', 'end');
  await page.keyboard.press('Alt+ArrowLeft');
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.from).toBeGreaterThan(block.from);
  expect(selection.from).toBeLessThan(block.to - 1);
});

test('keeps a paragraph after Option+Backspace empties its only word', async({page}) => {
  for(const content of [
    [paragraph('Word')],
    [paragraph('Before'), paragraph('Word'), paragraph('After')]
  ]) {
    await setDocument(page, {type: 'doc', content});
    const descriptors = await blocks(page);
    await setCaret(page, descriptors, 'Word', 'end');
    await page.keyboard.press('Alt+Backspace');
    await settleNativeSelection(page);

    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('text');
    expect(selection.text).toBe('');
    expect(selection.parentOffset).toBe(0);

    const document = await page.evaluate(() => window.chatInputEditorHarness.document());
    expect(document.content?.map((node) => node.type)).toEqual(
      content.map(() => 'paragraph')
    );
    expect(document.content?.[content.length === 1 ? 0 : 1].content).toBeUndefined();
  }
});

test('keeps a promoted trailing paragraph after Option+Backspace empties it', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Before')]
  });
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);
  await page.keyboard.insertText('Word');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content)
  .toHaveLength(2);

  await page.keyboard.press('Alt+Backspace');
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.text).toBe('');
  expect(selection.parentOffset).toBe(0);

  const document = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(document.content).toHaveLength(2);
  expect(document.content?.[0].content?.[0].text).toBe('Before');
  expect(document.content?.[1]).toEqual({type: 'paragraph'});

  await page.keyboard.press('Backspace');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content)
  .toHaveLength(1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('hardBreak')))
  .toHaveLength(1);

  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  const restored = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(restored.content).toHaveLength(2);
  expect(restored.content?.[1]).toEqual({type: 'paragraph'});
});

test('keeps promoted trailing paragraph identity through Undo and Redo', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [paragraph('Before')]
  });
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);
  await page.keyboard.insertText('Word');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content)
  .toHaveLength(2);

  await page.keyboard.press(await platformShortcut(page, 'Z'));
  await settleNativeSelection(page);
  let document = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(document.content).toHaveLength(1);
  expect(document.content?.[0].content?.[0].text).toBe('Before');

  await page.keyboard.press(await platformShortcut(page, 'Shift+Z'));
  await settleNativeSelection(page);
  document = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(document.content).toHaveLength(2);
  expect(document.content?.[1].content?.[0].text).toBe('Word');
});

test('keeps an emptied textblock inside every structural container', async({page}) => {
  const cases: Array<{
    container: string,
    document: JSONContent
  }> = [
    {
      container: 'heading',
      document: {
        type: 'doc',
        content: [{type: 'heading', attrs: {level: 2}, content: [text('Word')]}]
      }
    },
    {
      container: 'listItem',
      document: {
        type: 'doc',
        content: [{
          type: 'bulletList',
          content: [{type: 'listItem', content: [paragraph('Word')]}]
        }]
      }
    },
    {
      container: 'blockquote',
      document: {
        type: 'doc',
        content: [{type: 'blockquote', content: [paragraph('Word')]}]
      }
    },
    {
      container: 'detailsBody',
      document: {
        type: 'doc',
        content: [{
          type: 'details',
          attrs: {open: true},
          content: [
            {type: 'detailsSummary', content: [text('Summary')]},
            {type: 'detailsBody', content: [paragraph('Word')]}
          ]
        }]
      }
    },
    {
      container: 'tableCell',
      document: {
        type: 'doc',
        content: [{
          type: 'chatTableWrapper',
          content: [
            {type: 'chatTableTitle', content: [text('Title')]},
            {
              type: 'table',
              content: [{
                type: 'tableRow',
                content: [{type: 'tableCell', content: [paragraph('Word')]}]
              }]
            }
          ]
        }]
      }
    }
  ];

  for(const {container, document} of cases) {
    await setDocument(page, document);
    const descriptors = await blocks(page);
    await setCaret(page, descriptors, 'Word', 'end');
    await page.keyboard.press('Alt+Backspace');
    await settleNativeSelection(page);
    const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type, container).toBe('text');
    expect(selection.text, container).toBe('');
    expect(selection.parentOffset, container).toBe(0);
    expect(selection.path, container).toContain(container);
  }

  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [text('Before'), {type: 'hardBreak'}, text('Word')]
    }]
  });
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, 'BeforeWord', 'end');
  await page.keyboard.press('Alt+Backspace');
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe('Before');
  expect(selection.parentOffset).toBe('Before'.length + 1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.nodePositions('hardBreak')))
  .toHaveLength(1);
});

test('keeps vertical arrows inside wrapped text until its visual edge', async({page}) => {
  await page.setViewportSize({height: 600, width: 320});
  const wrapped = Array.from({length: 20}, () => 'wrapped').join(' ');
  await setDocument(page, {
    type: 'doc',
    content: [paragraph(wrapped), paragraph('After')]
  });
  const descriptors = await blocks(page);
  await setCaret(page, descriptors, wrapped, 'start');
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe(wrapped);
  expect(selection.parentOffset).toBeGreaterThan(0);

  await setCaret(page, descriptors, wrapped, 'end');
  await page.keyboard.press('ArrowUp');
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.text).toBe(wrapped);
  expect(selection.parentOffset).toBeLessThan(wrapped.length);

  await setCaret(page, descriptors, wrapped, 'end');
  await page.keyboard.press('ArrowDown');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).text)
  .toBe('After');
});

test('keeps the native collapsed selection after a line end without selecting its newline', async({page}) => {
  const value = 'First line';
  await setDocument(page, {
    type: 'doc',
    content: [paragraph(value), paragraph('Second line')]
  });
  const paragraphElement = page.locator('[data-chat-input-paragraph]').first();
  const points = await paragraphElement.evaluate((element, wordLength) => {
    const textNode = element.firstChild;
    if(textNode?.nodeType !== Node.TEXT_NODE) throw new Error('Expected paragraph text');
    const blockRect = element.getBoundingClientRect();
    const endRange = document.createRange();
    endRange.setStart(textNode, textNode.textContent!.length - 1);
    endRange.setEnd(textNode, textNode.textContent!.length);
    const endRect = endRange.getBoundingClientRect();
    const wordRange = document.createRange();
    wordRange.setStart(textNode, 0);
    wordRange.setEnd(textNode, wordLength);
    const wordRect = wordRange.getBoundingClientRect();
    return {
      after: {
        x: Math.min(blockRect.right - 2, endRect.right + 8),
        y: endRect.top + endRect.height / 2
      },
      word: {
        x: wordRect.left + wordRect.width / 2,
        y: wordRect.top + wordRect.height / 2
      }
    };
  }, 'First'.length);

  await setCaret(page, await blocks(page), value, 'end');
  await page.mouse.click(points.after.x, points.after.y, {clickCount: 2, delay: 50});
  await settleNativeSelection(page);
  let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.type).toBe('text');
  expect(selection.from).toBe(selection.to);
  expect(selection.text).toBe(value);
  expect(selection.parentOffset).toBe(value.length);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');

  await page.mouse.click(points.word.x, points.word.y, {clickCount: 2, delay: 50});
  await settleNativeSelection(page);
  selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.to - selection.from).toBe('First'.length);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('First');
});

test('places and drags a real mouse selection from a custom emoji', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        text('A'),
        {type: 'customEmoji', attrs: {documentId: '1', emoji: '🙂'}},
        text('BC')
      ]
    }]
  });
  const position = (await page.evaluate(() => (
    window.chatInputEditorHarness.nodePositions('customEmoji')
  )))[0];
  const emoji = page.locator('.chat-input-custom-emoji');
  const box = await emoji.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.click(box!.x + 1, box!.y + box!.height / 2);
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(position);

  await page.mouse.click(box!.x + box!.width - 1, box!.y + box!.height / 2);
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from)
  .toBe(position + 1);

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 28, box!.y + box!.height / 2, {steps: 5});
  await page.mouse.up();
  await settleNativeSelection(page);
  const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
  expect(selection.from).toBeLessThan(selection.to);
  expect(await emoji.evaluate((element) => (
    element.classList.contains('chat-input-custom-emoji-selected')
  ))).toBe(true);
});

test('places a mobile touch caret in a centered placeholder and beside custom emoji', async({
  baseURL,
  browser
}) => {
  test.skip(test.info().project.name !== 'chromium', 'Pixel 7 uses the Chromium Android engine');
  const context = await browser.newContext({...devices['Pixel 7'], baseURL});
  const page = await context.newPage();
  try {
    await page.goto('/e2e/fixtures/chatInputEditor.html');
    await page.waitForFunction(() => (
      document.documentElement.dataset.editorFixtureReady !== undefined
    ));
    await setDocument(page, {
      type: 'doc',
      content: [
        {
          type: 'pullquote',
          content: [{type: 'pullquoteText'}]
        },
        {
          type: 'paragraph',
          content: [
            text('A'),
            {type: 'customEmoji', attrs: {documentId: '1', emoji: '🙂'}},
            text('B')
          ]
        }
      ]
    });

    const placeholder = page.locator('[data-pullquote-text]');
    const placeholderBox = await placeholder.boundingBox();
    expect(placeholderBox).toBeTruthy();
    await page.touchscreen.tap(
      placeholderBox!.x + placeholderBox!.width / 2,
      placeholderBox!.y + placeholderBox!.height / 2
    );
    await settleNativeSelection(page);
    let selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.type).toBe('text');
    expect(selection.path).toContain('pullquoteText');
    expect(selection.parentOffset).toBe(0);

    const position = (await page.evaluate(() => (
      window.chatInputEditorHarness.nodePositions('customEmoji')
    )))[0];
    const emojiBox = await page.locator('.chat-input-custom-emoji').boundingBox();
    expect(emojiBox).toBeTruthy();
    await page.touchscreen.tap(emojiBox!.x + 1, emojiBox!.y + emojiBox!.height / 2);
    await settleNativeSelection(page);
    selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.from).toBe(position);

    await page.touchscreen.tap(
      emojiBox!.x + emojiBox!.width - 1,
      emojiBox!.y + emojiBox!.height / 2
    );
    await settleNativeSelection(page);
    selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
    expect(selection.from).toBe(position + 1);
  } finally {
    await context.close();
  }
});

for(const listType of ['orderedList', 'bulletList', 'taskList'] as const) for(const source of BACKSPACE_SOURCES) {
  test(`${source} Backspace removes a continuation newline within the last ${listType} item`, async({page}) => {
    const itemType = listType === 'taskList' ? 'taskItem' : 'listItem';
    for(const hardBreak of [false, true]) {
      await setDocument(page, {type: 'doc', content: [{type: listType, attrs: listType === 'orderedList' ? {start: 4414, startExplicit: true} : undefined, content: [
        {type: itemType, content: [paragraph('first')]},
        {type: itemType, content: hardBreak ? [{type: 'paragraph', content: [text('13232'), {type: 'hardBreak'}]}] : [paragraph('13232'), paragraph()]}
      ]}]});
      const descriptors = await blocks(page);
      const lastItemBlocks = descriptors.map((block, index) => ({...block, index})).filter(block => block.path.includes(itemType));
      await page.evaluate(index => window.chatInputEditorHarness.setCaretInTextblock(index, 'end'), lastItemBlocks[lastItemBlocks.length - 1].index);
      const before = await page.evaluate(() => window.chatInputEditorHarness.document());
      await pressEditorBackspace(page, source);
      const after = await page.evaluate(() => window.chatInputEditorHarness.document());
      expect(after.content).toHaveLength(1);
      expect(after.content?.[0].type).toBe(listType);
      expect(after.content?.[0].attrs).toEqual(before.content?.[0].attrs);
      expect(after.content?.[0].content).toHaveLength(2);
      expect(after.content?.[0].content?.[1].content).toEqual([paragraph('13232')]);
      expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({path: ['doc', listType, itemType, 'paragraph'], parentOffset: 5});
      expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
      expect(await page.evaluate(() => window.chatInputEditorHarness.redo())).toBe(true);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
    }
  });
}

for(const key of ['Delete', 'Backspace'] as const) for(const source of ['keyboard', 'beforeinput'] as const) test(`${source} ${key} joins plain quote body across its hidden author`, async({page}) => {
  await setDocument(page, {type: 'doc', content: [{type: 'blockquote', content: [paragraph('A')]}, paragraph('B')]});
  await page.evaluate(key => window.chatInputEditorHarness.setCaretInNode('paragraph', key === 'Delete' ? 0 : 1, key === 'Delete' ? 'end' : 0), key);
  const before = await page.evaluate(() => window.chatInputEditorHarness.document());
  const press = async() => {
    if(source === 'keyboard') await page.keyboard.press(key);
    else expect(await page.locator('#editor').evaluate((element, key) => {
      const event = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: key === 'Delete' ? 'deleteContentForward' : 'deleteContentBackward'});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, key)).toBe(true);
    await settleNativeSelection(page);
  };
  await press();
  const after = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(after.content).toHaveLength(1);
  expect(after.content?.[0].content).toEqual([paragraph('A'), paragraph('B'), {type: 'blockquoteCaption'}]);
  await press();
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content).toEqual([paragraph('AB'), {type: 'blockquoteCaption'}]);
  expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
  expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
});
