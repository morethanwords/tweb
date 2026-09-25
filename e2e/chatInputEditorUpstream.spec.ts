import {openEditor, settleNativeSelection as settle} from './fixtures/chatInputEditorTest';
import {expect, test} from '@playwright/test';
import type {ChatInputEditorBrowserHarness} from './fixtures/chatInputEditor';

declare global {
  interface Window {chatInputEditorHarness: ChatInputEditorBrowserHarness}
}

// Tiptap v3.28.0 demos: UndoRedo, TaskList, ListItem, CodeBlock, Paragraph.
// Use the production editor and native input; the public path is the API used
// by our toolbar, and is checked separately from native shortcuts.

test.beforeEach(async({page}) => {
  await openEditor(page, 'domcontentloaded');
  await page.locator('#editor').click();
});

for(const block of ['heading', 'footer', 'details', 'orderedList'] as const) for(const authoredBlank of [false, true]) {
  test(`native Undo restores the final placeholder after ${block}, typing and Redo (authoredBlank=${authoredBlank})`, async({page}) => {
    await page.evaluate(authoredBlank => {
      window.chatInputEditorHarness.setDocument({type: 'doc', content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
        ...(authoredBlank ? [{type: 'paragraph'}] : [])
      ]});
      window.chatInputEditorHarness.setExpanded(true);
      window.chatInputEditorHarness.setCaretInTrailingPlaceholder();
    }, authoredBlank);
    const before = await page.evaluate(() => window.chatInputEditorHarness.document());
    expect(await page.evaluate(block => block === 'orderedList' ?
      window.chatInputEditorHarness.toggleList('orderedList') :
      window.chatInputEditorHarness.insertStructuralBlock(block), block)).toBe(true);
    await settle(page);
    const converted = await page.evaluate(() => window.chatInputEditorHarness.document());
    await page.keyboard.insertText('Added');
    const after = await page.evaluate(() => window.chatInputEditorHarness.document());
    for(let cycle = 0; cycle < 3; ++cycle) {
      await page.keyboard.press('ControlOrMeta+z');
      await settle(page);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(converted);
      await page.keyboard.press('ControlOrMeta+z');
      await settle(page);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await settle(page);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
    }
  });
}

for(const type of ['bulletList', 'orderedList', 'taskList'] as const) {
  for(const source of ['public', 'keyboard']) test(`${source}: Select All toggles off ${type}, Undo/Redo and following Delete preserve the selection`, async({page}) => {
    await page.evaluate((type) => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
      type, content: ['A', 'B'].map((value) => ({
        type: type === 'taskList' ? 'taskItem' : 'listItem',
        content: [{type: 'paragraph', content: [{type: 'text', text: value}]}]
      }))
    }]}), type);
    await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph'));
    await page.keyboard.press('ControlOrMeta+a');
    const before = await page.evaluate(() => window.chatInputEditorHarness.document());
    if(source === 'public') expect(await page.evaluate((type) => window.chatInputEditorHarness.toggleList(type), type)).toBe(true);
    else await page.keyboard.press(`ControlOrMeta+Shift+${type === 'bulletList' ? '8' : type === 'orderedList' ? '7' : '9'}`);
    await settle(page);
    const after = await page.evaluate(() => window.chatInputEditorHarness.document());
    expect(after.content?.map(({type}) => type)).toEqual(['paragraph', 'paragraph']);
    expect(await page.evaluate(() => window.chatInputEditorHarness.selectedText())).toContain('A');
    expect(await page.evaluate(() => window.chatInputEditorHarness.selectedText())).toContain('B');

    if(source === 'public') expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
    else await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(before);
    if(source === 'public') expect(await page.evaluate(() => window.chatInputEditorHarness.redo())).toBe(true);
    else await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
    await page.keyboard.press('Backspace');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({type: 'doc', content: [{type: 'paragraph'}]});
    expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
  });
}

for(const {marker, type} of [
  {marker: '# ', type: 'heading'},
  {marker: '> ', type: 'blockquote'},
  {marker: '- ', type: 'bulletList'},
  {marker: '1. ', type: 'orderedList'},
  {marker: '[x] ', type: 'taskList'},
  {marker: '``` ', type: 'codeBlock'},
  {marker: '~~~ ', type: 'codeBlock'},
  {marker: '```js ', type: 'codeBlock'}
]) test(`Backspace reverts native input rule ${JSON.stringify(marker)} to its literal text`, async({page}) => {
  await page.keyboard.type(marker);
  await settle(page);
  expect(await page.evaluate((type) => window.chatInputEditorHarness.nodePositions(type), type)).toHaveLength(1);
  await page.keyboard.press('Backspace');
  await settle(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({
    type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: marker}]}]
  });
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).parentOffset).toBe(marker.length);
});

for(const {tag, mark} of [
  {tag: 'strong', mark: 'bold'},
  {tag: 'em', mark: 'italic'},
  {tag: 'code', mark: 'code'},
  {tag: 'mark', mark: 'highlight'}
]) test(`typing after pasted ${mark} follows its inclusive mark`, async({page}) => {
  expect(await page.evaluate((tag) => window.chatInputEditorHarness.pasteHTML(`<p><${tag}>Word</${tag}></p>`), tag)).toBe(true);
  await page.keyboard.type('X');
  await settle(page);
  const result = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(result.content).toHaveLength(1);
  expect(result.content?.[0].content).toEqual([{type: 'text', text: 'WordX', marks: [expect.objectContaining({type: mark})]}]);
});

test('typing after a pasted link remains outside the non-inclusive link', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.pasteHTML('<p><a href="https://example.com">Link</a></p>'))).toBe(true);
  await page.keyboard.type('X');
  await settle(page);
  const content = (await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content;
  expect(content).toHaveLength(2);
  expect(content?.[0]).toMatchObject({type: 'text', text: 'Link', marks: [{type: 'link'}]});
  expect(content?.[1]).toEqual({type: 'text', text: 'X'});
});

for(const source of ['virtual', 'beforeinput']) for(const marker of ['1. ', '```js ']) {
  test(`${source} Backspace reverts input rule ${JSON.stringify(marker)}`, async({page}) => {
    await page.keyboard.type(marker);
    await settle(page);
    if(source === 'virtual') expect(await page.evaluate(() => window.chatInputEditorHarness.deleteBackward())).toBe(true);
    else expect(await page.locator('#editor').evaluate((element) => {
      const event = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'deleteContentBackward'});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual({
      type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: marker}]}]
    });
  });
}

test('readonly toggles the existing checklist control and prevents edits', async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
    type: 'taskList', content: [{type: 'taskItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Task'}]}]}]
  }]}));
  const checkbox = page.locator('#editor button[role="checkbox"]');
  await expect(checkbox).toBeEnabled();
  await page.evaluate(() => window.chatInputEditorHarness.setEditable(false));
  await expect(checkbox).toBeDisabled();
  await page.evaluate(() => window.chatInputEditorHarness.setEditable(true));
  await expect(checkbox).toBeEnabled();
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
});

for(const backward of [false, true]) test(`native selection recognizes a complete link at its boundaries, backward=${backward}`, async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.pasteHTML('<p>prefix <a href="https://example.com">abc</a> suffix</p>'));
  await page.evaluate((backward) => window.chatInputEditorHarness.setCaret(backward ? 11 : 8), backward);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from).toBe(backward ? 11 : 8);
  for(let i = 0; i < 3; ++i) await page.keyboard.press(backward ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
  await settle(page);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('abc');
  expect(await page.evaluate(() => window.chatInputEditorHarness.selectedLink())).toEqual({
    from: 8, to: 11, text: 'abc', url: 'https://example.com'
  });
});

for(const {style, mark} of [{style: 'sub', mark: 'subscript'}, {style: 'super', mark: 'superscript'}]) {
  test(`HTML ${style} vertical alignment survives paste, native typing and history`, async({page}) => {
    expect(await page.evaluate((style) => window.chatInputEditorHarness.pasteHTML(`<p><span style="vertical-align: ${style}">A</span></p>`), style)).toBe(true);
    await page.evaluate(() => window.chatInputEditorHarness.separateHistory());
    await page.keyboard.type('B');
    await settle(page);
    const after = await page.evaluate(() => window.chatInputEditorHarness.document());
    expect(after.content?.[0].content).toEqual([{type: 'text', text: 'AB', marks: [{type: mark}]}]);
    await page.keyboard.press('ControlOrMeta+z');
    await settle(page);
    expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content)
    .toEqual([{type: 'text', text: 'A', marks: [{type: mark}]}]);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(page);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(after);
  });
}

for(const {shortcut, mark} of [
  {shortcut: 'b', mark: 'bold'}, {shortcut: 'i', mark: 'italic'},
  {shortcut: 'u', mark: 'underline'}, {shortcut: 'Shift+s', mark: 'strike'}
]) test(`native ${shortcut} toggles ${mark} twice without moving the selected text`, async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.pasteHTML('<p>abc</p>'));
  await page.evaluate(() => window.chatInputEditorHarness.setTextSelection(1, 4));
  await settle(page);
  await page.keyboard.press(`ControlOrMeta+${shortcut}`);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content)
  .toEqual([{type: 'text', text: 'abc', marks: [{type: mark}]}]);
  expect(await page.evaluate(() => window.chatInputEditorHarness.selectedText())).toBe('abc');
  await page.keyboard.press(`ControlOrMeta+${shortcut}`);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content)
  .toEqual([{type: 'text', text: 'abc'}]);
});

for(const level of [1, 2, 3, 4, 5, 6]) test(`native heading level ${level} supports input rule, undo marker and keyboard toggle`, async({page}) => {
  const marker = '#'.repeat(level) + ' ';
  await page.keyboard.type(marker);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0])
  .toMatchObject({type: 'heading', attrs: {level}});
  await page.keyboard.press('Backspace');
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0])
  .toEqual({type: 'paragraph', content: [{type: 'text', text: marker}]});
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'abc'}]}]}));
  await page.evaluate(() => window.chatInputEditorHarness.setCaret(2));
  await settle(page);
  await page.keyboard.press(`ControlOrMeta+Alt+${level}`);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0])
  .toMatchObject({type: 'heading', attrs: {level}, content: [{type: 'text', text: 'abc'}]});
  await page.keyboard.press(`ControlOrMeta+Alt+${level}`);
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0])
  .toEqual({type: 'paragraph', content: [{type: 'text', text: 'abc'}]});
});

for(const {marker, type, mark} of [
  {marker: '* ', type: 'bulletList'}, {marker: '+ ', type: 'bulletList'},
  {marker: '[ ] ', type: 'taskList'}, {marker: '[X] ', type: 'taskList'},
  {marker: '**abc**', mark: 'bold'}, {marker: '__abc__', mark: 'bold'},
  {marker: '*abc*', mark: 'italic'}, {marker: '~~abc~~', mark: 'strike'}
]) test(`native additional input rule ${JSON.stringify(marker)}`, async({page}) => {
  await page.keyboard.type(marker);
  await settle(page);
  const doc = await page.evaluate(() => window.chatInputEditorHarness.document());
  if(type) {
    expect(doc.content?.[0].type).toBe(type);
    if(type === 'taskList') expect(doc.content?.[0].content?.[0].attrs?.checked).toBe(marker === '[X] ');
  } else expect(doc.content?.[0].content).toEqual([{type: 'text', text: 'abc', marks: [{type: mark}]}]);
  await page.keyboard.press('Backspace');
  await settle(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0])
  .toEqual({type: 'paragraph', content: [{type: 'text', text: marker}]});
});
