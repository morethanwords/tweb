import {expect, type Locator, type Page} from '@playwright/test';
import {PNG} from 'pngjs';
import {test} from './workerContext';

// The fields that hold a plain message — a caption, a checklist, a poll — run on the composer's
// engine. What they show and what they let a person put in has to stay theirs, not the composer's.

async function openStory(page: Page, story: string) {
  // the query differs per story: a change of the hash alone keeps the document and the popup before
  await page.goto(`/?popups=1&story=${story}#${story}`);
  // the sandbox can reload itself once while it starts (master does it too): wait that out
  await expect(async() => {
    await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
    await page.evaluate(() => window.popupSandbox.ready());
  }).toPass({timeout: 60_000});
  await expect(page.locator('.popup.active').locator('[data-chat-input-editor], .input-field-input').first()).toBeVisible();
}

// a field filled while its popup still sets it up loses what was typed: type once it holds it
async function typeInto(page: Page, field: Locator, text: string) {
  await expect(async() => {
    await field.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text);
    await expect(field).toHaveText(text, {timeout: 500});
  }).toPass();
}

function readField(page: Page, selector: string) {
  return page.locator(selector).evaluate(async(element) => {
    const registryPath = '/src/components/chat/inputEditor/registry.ts';
    const {getChatInputEditor} = await window.e2eImport(registryPath);
    const {value, entities} = getChatInputEditor(element as HTMLElement).getRichValue(true, false);
    return {value, entities: entities.map((entity: {_: string}) => entity._)};
  });
}

// An arrow pressed right after select-all can lose to the selection being put back (seen on
// master before these fields' changes too): put the caret at the end through the editor instead.
function caretToEnd(field: Locator) {
  return field.evaluate(async(element) => {
    const registryPath = '/src/components/chat/inputEditor/registry.ts';
    const {getChatInputEditor} = await window.e2eImport(registryPath);
    getChatInputEditor(element as HTMLElement).focusAtEnd();
  });
}

const CHECKLIST_TITLE = '.popup [data-chat-input-editor] >> nth=0';

test('an empty caption shows its own placeholder, and its text takes no extra line', async({page}) => {
  await openStory(page, 'newMedia');
  const input = page.locator('.popup-new-media.active .input-message-input');
  await expect(input).toBeVisible();
  // a caption keeps the trailing paragraph for the line after a quote, and never shows it
  await expect(input.locator('.chat-input-trailing-placeholder')).toBeHidden();
  // the layout height: the popup's opening scale would change a measured box
  const height = () => input.evaluate((element) => (element as HTMLElement).offsetHeight);
  const empty = await height();

  // the caption keeps a technical paragraph it never shows: an arrow at the end of the text stays
  // there, and what is inserted next (an emoji from the panel) continues the line
  for(const key of ['ArrowRight', 'ArrowDown']) {
    await typeInto(page, input, 'caption');
    await page.keyboard.press(key);
    expect(await input.evaluate(async(element) => {
      const registryPath = '/src/components/chat/inputEditor/registry.ts';
      const {getChatInputEditor} = await window.e2eImport(registryPath);
      const editor = getChatInputEditor(element as HTMLElement);
      editor.replaceSelection('!');
      return editor.getRichValue(false).value;
    }), key).toBe('caption!');
  }
  await typeInto(page, input, '');
  await page.keyboard.press('Backspace');

  // an empty caption takes no line break: there is nothing for it to separate (Enter sends)
  await input.click();
  await page.keyboard.press('Shift+Enter');
  await expect(input.locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(0);
  expect(await height()).toBe(empty);

  await typeInto(page, input, 'caption');
  await expect(input.locator('[data-chat-input-paragraph]:visible')).toHaveCount(1);
  await expect(input.locator('.chat-input-trailing-placeholder')).toBeHidden();
  expect(await height()).toBe(empty);
});

test('a field carries the formatting it declares and nothing else', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // a checklist title declares none: no shortcut, no typed markdown puts any in
  await openStory(page, 'checklist');
  const title = page.locator(CHECKLIST_TITLE);
  await typeInto(page, title, 'word');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.press('ControlOrMeta+I');
  await expect.poll(() => readField(page, CHECKLIST_TITLE)).toEqual({value: 'word', entities: []});
  await caretToEnd(title);
  await page.keyboard.type(' **md** ');
  await expect.poll(() => readField(page, CHECKLIST_TITLE)).toEqual({value: 'word **md** ', entities: []});

  // a poll's description declares bold among a few: bold it gets, a quote it does not
  await openStory(page, 'createPoll');
  const description = page.locator('.popup [data-chat-input-editor] >> nth=1');
  await typeInto(page, description, 'word');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+B');
  await expect.poll(() => readField(page, '.popup [data-chat-input-editor] >> nth=1'))
  .toEqual({value: 'word', entities: ['messageEntityBold']});
  await caretToEnd(description);
  await page.keyboard.type('\n> quote');
  await expect(description.locator('blockquote')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('Enter in a one-line field reaches the popup it sits in', async({page}) => {
  await openStory(page, 'checklist');
  const fields = page.locator('.popup [data-chat-input-editor]');
  await typeInto(page, fields.nth(0), 'Groceries');
  await typeInto(page, fields.nth(1), 'Milk');
  await page.keyboard.press('Enter');
  await expect(page.locator('.popup.active')).toHaveCount(0);
});

test('an emoji is drawn the way a message draws it, and selected with the text around it', async({page}) => {
  await openStory(page, 'checklist');
  const title = page.locator(CHECKLIST_TITLE);
  await typeInto(page, title, 'List \u{1F603} done');

  const native = await page.evaluate(async() => {
    const path = '/src/lib/richTextProcessor/emojiImage.ts';
    const {isEmojiNative} = await window.e2eImport(path);
    return isEmojiNative('1f603');
  });
  const image = title.locator('.chat-input-emoji-image');
  if(native) {
    await expect(image).toHaveCount(0);
    return;
  }

  await expect(image).toHaveText('\u{1F603}');
  const drawn = await image.evaluate((element) => {
    const style = getComputedStyle(element);
    const {width, height} = element.getBoundingClientRect();
    return {width, height, color: style.color, background: style.backgroundImage};
  });
  expect(drawn).toEqual({
    width: 18,
    height: 18,
    color: 'rgba(0, 0, 0, 0)',
    background: expect.stringContaining('assets/img/emoji/1f603.png')
  });
  expect(await readField(page, CHECKLIST_TITLE)).toEqual({value: 'List \u{1F603} done', entities: []});

  // the glyph under the image is transparent: the selection is painted behind the image instead,
  // and the browser must not paint the selected glyph over it — the emoji's corner, outside the
  // round face, takes the colour of the selected space before it
  await page.keyboard.press('ControlOrMeta+A');
  await expect(image).toHaveClass(/chat-input-emoji-image-selected/);
  const box = await image.boundingBox();
  const shot = PNG.sync.read(await page.screenshot({
    clip: {x: box.x - 6, y: box.y, width: box.width + 6, height: box.height}
  }));
  const scale = shot.width / (box.width + 6);
  const pixel = (x: number, y: number) => {
    const offset = (Math.round(y * scale) * shot.width + Math.round(x * scale)) * 4;
    return [...shot.data.subarray(offset, offset + 3)];
  };
  const space = pixel(2, box.height / 2);
  const corner = pixel(7, 1);
  expect(Math.max(...space.map((channel, index) => Math.abs(channel - corner[index])))).toBeLessThan(40);
});

// The composer's paragraphs are a rich message's blocks, with a page gutter and spacing around
// them; in a plain field, which has padding of its own, they doubled it: the text stood a gutter
// past the placeholder and the label, and an InputField grew taller than every other one.
test('a plain field\'s text starts where its placeholder does, in a field of the usual height', async({page}) => {
  const textStart = (field: Locator, which: 'placeholder' | 'text') => field.evaluate((input, which) => {
    const container = input.closest('.input-field, .simple-message-input-container, [class*="formField"]') || input.parentElement;
    const target = which === 'text' ?
      input.querySelector('[data-chat-input-paragraph]') :
      container.querySelector('.input-field-placeholder, .input-message-placeholder');
    const range = document.createRange();
    range.selectNodeContents(target);
    return Math.round([...range.getClientRects()].find((rect) => rect.width).x - input.getBoundingClientRect().x);
  }, which);
  // the popup scales in: measure once it stands still
  const settled = (field: Locator) => expect.poll(async() => {
    const before = await field.boundingBox();
    await page.waitForTimeout(100);
    return JSON.stringify(before) === JSON.stringify(await field.boundingBox());
  }).toBe(true);

  const cases: Array<[string, number]> = [['newMedia', 0], ['checklist', 0], ['createPoll', 2]];
  for(const [story, index] of cases) {
    await openStory(page, story);
    const field = page.locator('.popup [data-chat-input-editor]').nth(index);
    await settled(field);
    const placeholder = await textStart(field, 'placeholder');
    await typeInto(page, field, 'Wg');
    expect(await textStart(field, 'text'), story).toBe(placeholder);
  }

  // the checklist's title is an InputField, as the new contact's name is one without the composer
  await openStory(page, 'checklist');
  const title = await page.locator(CHECKLIST_TITLE).evaluate((element) => (element as HTMLElement).offsetHeight);
  await openStory(page, 'createContact');
  const name = page.locator('.popup.active .input-field-input').first();
  expect(title).toBe(await name.evaluate((element) => (element as HTMLElement).offsetHeight));
});
