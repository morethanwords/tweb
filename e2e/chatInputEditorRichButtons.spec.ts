import {openEditor, settleNativeSelection} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import type {ChatInputEditorBrowserHarness} from './fixtures/chatInputEditor';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

const buttonAttrs = (label: string, attrs: Record<string, unknown>) => ({
  action: 'url',
  url: '',
  copyText: '',
  userId: null as string,
  color: null as string,
  link: false,
  ...attrs,
  label: [{type: 'text', text: label}]
});

const button = (label: string, attrs: Record<string, unknown>): JSONContent => ({
  type: 'richButton',
  attrs: buttonAttrs(label, attrs)
});

async function setDocument(page: Page, content: JSONContent[]) {
  expect(await page.evaluate((content) => (
    window.chatInputEditorHarness.setDocument({type: 'doc', content})
  ), content)).toBe(true);
  await settleNativeSelection(page);
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

// layer 229: a button inside the text and a row of them, as a user puts them into a rich message
test('draws buttons the way they will be sent and sends them as textButton and pageBlockButtonRow', async({page}) => {
  await setDocument(page, [
    {type: 'paragraph', content: [
      {type: 'text', text: 'Read '},
      button('the docs', {url: 'https://core.telegram.org', color: 'primary'}),
      {type: 'text', text: ' now'}
    ]},
    {type: 'buttonRow', attrs: {align: 'center', buttons: [
      buttonAttrs('Copy', {action: 'copy', copyText: 'TELEGRAM'}),
      buttonAttrs('Soon', {action: 'disabled', color: 'danger'})
    ]}}
  ]);

  expect(await page.evaluate(() => window.chatInputEditorHarness.mode())).toBe('rich');
  const inline = page.locator('.chat-input-rich-button:not([data-button-row] *)');
  await expect(inline).toHaveText('the docs');
  // where a link button leads is shown on hover, as on desktop
  await expect(inline).toHaveAttribute('title', 'https://core.telegram.org');
  await expect(page.locator('[data-button-row] .chat-input-rich-button')).toHaveText(['Copy', 'Soon']);
  // the fixture stubs ButtonMenuToggle out, so only that the row carries its menu is checked here
  await expect(page.locator('[data-button-row] .chat-input-button-row-menu')).toHaveCount(1);

  const blocks = (await page.evaluate(() => window.chatInputEditorHarness.richMessage())).input.blocks;
  expect(blocks[0]).toMatchObject({
    _: 'pageBlockParagraph',
    text: {texts: [
      {_: 'textPlain', text: 'Read '},
      {
        _: 'textButton',
        text: {_: 'textPlain', text: 'the docs'},
        type: {_: 'inlineButtonTypeUrl', url: 'https://core.telegram.org'},
        style: {pFlags: {bg_primary: true}}
      },
      {_: 'textPlain', text: ' now'}
    ]}
  });
  expect(blocks[1]).toMatchObject({
    _: 'pageBlockButtonRow',
    pFlags: {align_center: true},
    buttons: [
      {text: {_: 'textPlain', text: 'Copy'}, type: {_: 'inlineButtonTypeCopy', copy_text: 'TELEGRAM'}},
      {text: {_: 'textPlain', text: 'Soon'}, type: {_: 'inlineButtonTypeDisabled'}, style: {pFlags: {bg_danger: true}}}
    ]
  });
});

test('crosses an inline button with one arrow press', async({page}) => {
  await setDocument(page, [{type: 'paragraph', content: [
    {type: 'text', text: 'A'},
    button('Open', {url: 'https://telegram.org'}),
    {type: 'text', text: 'B'}
  ]}]);

  const [position] = await page.evaluate(() => window.chatInputEditorHarness.nodePositions('richButton'));

  expect(await page.evaluate((position) => window.chatInputEditorHarness.setCaret(position), position)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from).toBe(position + 1);

  await page.keyboard.press('ArrowLeft');
  await settleNativeSelection(page);
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).from).toBe(position);
});

// a quote of paragraphs folds in a rich message too, the quote holding a list does not
test('offers folding only on a rich quote that a pageBlockBlockquote can carry', async({page}) => {
  await setDocument(page, [
    {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Rich'}]},
    {type: 'blockquote', attrs: {collapsed: true}, content: [
      {type: 'paragraph', content: [{type: 'text', text: 'Folded'}]},
      {type: 'paragraph', content: [{type: 'text', text: 'lines'}]}
    ]},
    {type: 'blockquote', attrs: {collapsed: true}, content: [{
      type: 'bulletList',
      content: [{type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Item'}]}]}]
    }]}
  ]);

  const quotes = page.locator('[data-chat-input-blockquote] > blockquote');
  await expect(quotes.nth(0)).toHaveClass(/input-collapsible-quote/);
  await expect(quotes.nth(1)).not.toHaveClass(/input-collapsible-quote/);

  const blocks = (await page.evaluate(() => window.chatInputEditorHarness.richMessage())).input.blocks;
  expect(blocks[1]).toMatchObject({
    _: 'pageBlockBlockquote',
    pFlags: {collapsed: true},
    text: {_: 'textPlain', text: 'Folded\nlines'}
  });
  expect(blocks[2]).toMatchObject({_: 'pageBlockBlockquoteBlocks'});
});

// a button is a real button: Tab reaches it, Enter and Space press it (its box opens — that needs
// the popup graph, which this page stubs), and the editor leaves those keys alone
test('presses a button from the keyboard without the editor taking the key', async({page}) => {
  await setDocument(page, [{type: 'paragraph', content: [
    {type: 'text', text: 'A'},
    button('Open', {url: 'https://telegram.org'}),
    {type: 'text', text: 'B'}
  ]}]);
  const before = await page.evaluate(() => window.chatInputEditorHarness.richMessage());

  const chip = page.locator('.chat-input-rich-button');
  await chip.evaluate((element) => {
    (window as any).chipPresses = 0;
    // stands in for the box; the chip's own listener opens it
    element.addEventListener('click', (event) => {
      ++(window as any).chipPresses;
      event.stopImmediatePropagation();
    }, {capture: true});
  });
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');

  expect(await page.evaluate(() => (window as any).chipPresses)).toBe(2);
  expect(await page.evaluate(() => window.chatInputEditorHarness.richMessage())).toEqual(before);
});
