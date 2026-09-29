import {expect} from '@playwright/test';
import {test} from './workerContext';
import type {CreateLinkPopupResult} from '@components/popups/createLink';

declare global {
  interface Window {
    linkPickerResult: {text: string, url: string} | 'cancelled' | undefined
  }
}

test('link popup validates, moves focus with Enter, submits and cancels through the Solid shell', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  const open = (editing: boolean) => page.evaluate(async editing => {
    const path = '/src/components/popups/createLink.tsx';
    const {default: showPicker} = await import(/* @vite-ignore */ path);
    window.linkPickerResult = undefined;
    void showPicker(editing ? {editing: true, text: 'Link', url: 'https://example.com'} : {})
    .then((result: CreateLinkPopupResult) => window.linkPickerResult = result, () => window.linkPickerResult = 'cancelled');
  }, editing);
  await open(false);
  const popup = page.locator('.popup-create-link.active');
  const text = popup.getByRole('textbox', {name: 'Text', exact: true});
  const url = popup.getByRole('textbox', {name: 'URL', exact: true});
  await expect(text).toBeFocused();
  await text.fill('Link');
  await text.press('Enter');
  await expect(url).toBeFocused();
  await url.fill('two words');
  await expect(popup.getByRole('button', {name: 'Create', exact: true})).toBeDisabled();
  await url.fill('example.com');
  await url.press('Enter');
  await expect.poll(() => page.evaluate(() => window.linkPickerResult)).toEqual({text: 'Link', url: 'https://example.com'});
  await expect(popup).toHaveCount(0);
  await open(true);
  await expect(url).toBeFocused();
  await url.press('Escape');
  await expect.poll(() => page.evaluate(() => window.linkPickerResult)).toBe('cancelled');
  await expect(popup).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('media caption keyboard formatting preserves text and does not submit the popup', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // the toolbar's buttons pressed from the keyboard: the keyboard layer
  await page.goto('/?popups=1&a11y=1#newMedia');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
  await page.evaluate(() => window.popupSandbox.ready());
  const popup = page.locator('.popup-new-media.active');
  const input = popup.locator('.input-message-input');
  await expect(input).toBeVisible();
  await expect(popup.locator('img').first()).toBeVisible();
  // The caption runs the composer's engine on the plain schema: same formatting,
  // no way to author a block a caption cannot carry.
  await expect(input).toHaveAttribute('data-chat-input-editor', 'tiptap');
  await expect(input).toHaveAttribute('data-chat-input-editor-mode', 'plain');
  const type = async(text: string) => {
    await input.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
  };
  await type('Caption');
  await expect(popup.locator('.simple-message-input-limit')).toHaveText('(3)');
  await type('12345678901');
  await expect(input).toHaveClass(/error/);
  await expect(popup.locator('.simple-message-input-limit')).toHaveText('(-1)');
  await type('Caption');
  await expect(input).not.toHaveClass(/error/);
  await input.press('ControlOrMeta+a');
  const tooltip = page.locator('.markup-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByRole('button', {name: 'Highlight', exact: true})).toHaveCount(0);
  await tooltip.getByRole('button', {name: 'Bold', exact: true}).press('Enter');
  await expect(popup).toBeVisible();
  const richValue = () => input.evaluate(async(element) => {
    const path = '/src/helpers/dom/getRichValueWithCaret.ts';
    const {default: getValue} = await import(/* @vite-ignore */ path);
    return getValue(element, true, false);
  });
  await expect.poll(async() => (await richValue()).entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 7}]);
  await tooltip.getByRole('button', {name: 'Quote', exact: true}).press('Space');
  await expect(popup).toBeVisible();
  expect((await richValue()).value).toBe('Caption');
  expect((await richValue()).entities).toEqual(expect.arrayContaining([
    expect.objectContaining({_: 'messageEntityBold', offset: 0, length: 7}),
    expect.objectContaining({_: 'messageEntityBlockquote', offset: 0, length: 7})
  ]));
  expect(errors).toEqual([]);
});

// Paste is the only way arbitrary rich HTML reaches a caption, and the plain
// schema is what keeps it sendable: marks survive, blocks degrade to their text,
// and the mode never flips to rich.
const CAPTION_PASTE_CASES = [
  {
    name: 'inline marks',
    html: '<p><b>bold</b> <i>it</i> <s>st</s> <u>un</u> <code>mono</code> <a href="https://t.me/x">link</a></p>',
    value: 'bold it st un mono link',
    entities: [
      'messageEntityBold', 'messageEntityItalic', 'messageEntityStrike',
      'messageEntityUnderline', 'messageEntityCode', 'messageEntityTextUrl'
    ]
  },
  {name: 'a quote', html: '<blockquote>quoted</blockquote>', value: 'quoted', entities: ['messageEntityBlockquote']},
  {name: 'a list', html: '<ul><li>one</li><li>two</li></ul>', value: '- one\n- two', entities: []},
  {name: 'a heading', html: '<h2>Title</h2><p>body</p>', value: 'Title\nbody', entities: []},
  {name: 'a table', html: '<table><tr><td>a</td><td>b</td></tr></table>', value: 'ab', entities: []},
  {name: 'a script URL', html: '<p><a href="javascript:alert(1)">probe</a></p>', value: 'probe', entities: []}
];

for(const {name, html, value, entities} of CAPTION_PASTE_CASES) {
  test(`pasting ${name} into a caption keeps it sendable`, async({page}) => {
    await page.goto('/?popups=1#newMedia');
    await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
    await page.evaluate(() => window.popupSandbox.ready());
    const input = page.locator('.popup-new-media.active .input-message-input');
    await expect(input).toBeVisible();
    await input.click();

    const pasted = await input.evaluate(async(element, html) => {
      const registryPath = '/src/components/chat/inputEditor/registry.ts';
      const {getChatInputEditor} = await import(/* @vite-ignore */ registryPath);
      const editor = getChatInputEditor(element as HTMLElement);
      editor.setTextWithEntities('');
      (editor as unknown as {editor: {view: {pasteHTML(html: string): void}}}).editor.view.pasteHTML(html);
      const read = editor.getRichValue(true);
      return {
        mode: editor.getMode(),
        value: read.value,
        entities: (read.entities || []).map((entity: {_: string}) => entity._)
      };
    }, html);

    expect(pasted.value).toBe(value);
    expect(pasted.entities).toEqual(entities);
    expect(pasted.mode).toBe('plain');
  });
}

test('an empty or explicitly disabled first selection does not poison the next field', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  // Formattable means the composer is mounted, so these stand-ins get it the way
  // a caption or a poll description does.
  await page.evaluate(async() => {
    const plainFieldPath = '/src/components/chat/inputEditor/plainField.ts';
    const {default: attachPlainMessageEditor} = await import(/* @vite-ignore */ plainFieldPath);
    for(const id of ['first', 'second']) {
      const input = document.createElement('div');
      input.id = `qa-${id}`;
      input.className = 'input-message-input';
      input.contentEditable = 'true';
      input.style.cssText = 'position: fixed; left: 350px; width: 300px; min-height: 30px;';
      input.style.top = id === 'first' ? '40px' : '100px';
      document.body.append(input);
      attachPlainMessageEditor(input);
    }
  });

  const type = async(id: string, text: string) => {
    await page.locator(id).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
  };
  const selectAll = async(id: string) => {
    await page.locator(id).click();
    await page.keyboard.press('ControlOrMeta+a');
  };

  await type('#qa-first', '   ');
  await selectAll('#qa-first');
  await expect(page.locator('.markup-tooltip.is-visible')).toHaveCount(0);

  await type('#qa-second', 'Second');
  await selectAll('#qa-second');
  await expect(page.locator('.markup-tooltip')).toBeVisible();

  await page.locator('#qa-first').evaluate(element => element.setAttribute('can-format', ''));
  await type('#qa-first', 'Disabled');
  await selectAll('#qa-first');
  await expect(page.locator('.markup-tooltip.is-visible')).toHaveCount(0);

  await selectAll('#qa-second');
  await expect(page.locator('.markup-tooltip')).toBeVisible();
});
