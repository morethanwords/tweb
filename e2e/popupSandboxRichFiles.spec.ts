import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {RichMediaComposerHarness} from './fixtures/richMediaComposer';

declare global {
  interface Window {
    richMediaComposerHarness: RichMediaComposerHarness
  }
}

// Files in a rich message, as the other clients put them there: a file block where the caret is,
// uploaded as a file and sent as one, with a caption; music stays an audio. And a file of a message
// drawn as a document row.

const PDF = {name: 'Quarterly report.pdf', size: 2345678, mimeType: 'application/pdf'};

async function open(page: Page, {a11y = false, inChat = false} = {}) {
  await page.goto(a11y ? '/?popups=1&a11y=1' : '/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async(inChat) => {
    const path = '/e2e/fixtures/richMediaComposer.ts';
    const {mountRichMediaComposerHarness} = await window.e2eImport(path);
    window.richMediaComposerHarness = mountRichMediaComposerHarness({inChat});
  }, inChat);
}

const state = (page: Page) => page.evaluate(() => window.richMediaComposerHarness.state());

// files made in the page: what a picker or a drop hands over, of the size the server then reports
const insertFiles = (page: Page, files: {name: string, type: string, size?: number}[], asFile?: boolean) => page.evaluate(({files, asFile}) => (
  window.richMediaComposerHarness.insertFiles(files.map(({name, type, size}) => (
    new File([size ? new Uint8Array(size) : 'data'], name, {type})
  )), asFile)
), {files, asFile});

const mediaBlocks = async(page: Page) => (await state(page)).document.content
.filter((node) => node.type === 'richMedia')
.map((node) => node.attrs.block._);

test('a file goes in where the caret is as a file block, uploads as a file and is sent as one, with its caption', async({page}) => {
  await open(page);
  await page.evaluate(() => window.richMediaComposerHarness.setText('Before'));
  expect(await insertFiles(page, [{name: PDF.name, type: PDF.mimeType, size: PDF.size}])).toBe(true);

  // a document row from the first moment, uploading
  const row = page.locator('.chat-input-rich-media-item-row');
  await expect(row).toContainText(PDF.name);
  await expect(page.locator('[data-upload-id]')).toHaveCount(1);
  await expect.poll(async() => (await state(page)).asFileRequests).toEqual([true]);

  await page.evaluate((file) => window.richMediaComposerHarness.finishDocument(0, file), PDF);
  await expect(page.locator('[data-upload-id]')).toHaveCount(0);
  await expect(row).toContainText('2.2 MB');
  // nothing follows the size: no separator in front of an empty place
  expect((await row.locator('.document-size').innerText()).trim()).not.toMatch(/·$/);

  await page.locator('[data-rich-caption]').click();
  await page.keyboard.type('The numbers');

  const {input, output} = await page.evaluate(() => window.richMediaComposerHarness.richMessage());
  expect(output.blocks.map((block) => block._)).toEqual(['pageBlockParagraph', 'pageBlockDocument']);
  expect(output.blocks[1]).toMatchObject({
    _: 'pageBlockDocument',
    document_id: '9200',
    caption: {text: {_: 'textPlain', text: 'The numbers'}}
  });
  expect(output.documents.map((document) => document.id)).toEqual(['9200']);
  expect(input.documents).toEqual([expect.objectContaining({_: 'inputDocument', id: '9200'})]);
  expect((await state(page)).sends).toBe(0);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
});

test('a photo attached as a file is a file block, and music an audio all the same', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  expect(await insertFiles(page, [{name: 'photo.jpg', type: 'image/jpeg'}], true)).toBe(true);
  await expect.poll(() => mediaBlocks(page)).toEqual(['pageBlockDocument']);
  expect(await insertFiles(page, [{name: 'track.mp3', type: 'audio/mpeg'}], true)).toBe(true);
  await expect.poll(() => mediaBlocks(page)).toEqual(['pageBlockDocument', 'pageBlockAudio']);
  // a file block uploads as a file; an audio as an audio (once its length is read)
  await expect.poll(async() => (await state(page)).asFileRequests).toEqual([true, false]);

  // each upload is drawn by its row, as a bubble draws an outgoing one's: a file's ring on its icon,
  // an audio's over its play button; nothing of the editor's over them
  const rows = page.locator('.chat-input-rich-media-item-row');
  await expect(rows.nth(0).locator('.document-ico .preloader-container')).toBeVisible();
  await expect(rows.nth(1).locator('.audio-download .preloader-container')).toBeVisible();
  await expect(page.locator('.chat-input-rich-media-upload')).toHaveCount(0);
  // under its ring a file's icon gives up its extension, as in the chat
  await expect(rows.nth(0).locator('.document-ico-text')).toHaveCSS('opacity', '0');
  // and nothing of the play button shows through an audio's: the ring takes the button's colour
  const audioRing = await rows.nth(1).evaluate((row) => {
    const toggle = row.querySelector<HTMLElement>('.audio-toggle');
    const ring = row.querySelector<HTMLElement>('.audio-download');
    const bounds = toggle.getBoundingClientRect();
    return {
      onTop: ring.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 4)),
      background: getComputedStyle(ring).backgroundColor,
      button: getComputedStyle(toggle).backgroundColor
    };
  });
  expect(audioRing.onTop).toBe(true);
  expect(audioRing.background).toBe(audioRing.button);

  // the audio row goes away before its track was ever ready, and nothing complains
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(errors).toEqual([]);
});

test('a file and an audio line up with the text, their menu mid-row a gutter in from the end, with only what applies', async({page}) => {
  // where the chat keeps the field: its rows give every button its size
  await open(page, {inChat: true});
  await page.evaluate(() => window.richMediaComposerHarness.setText('Before'));
  const name = 'A rather long name of a quarterly financial report for the whole of the year, final version.pdf';
  expect(await insertFiles(page, [{name, type: 'application/pdf'}])).toBe(true);
  expect(await insertFiles(page, [{name: 'track.mp3', type: 'audio/mpeg'}])).toBe(true);
  await expect.poll(async() => (await state(page)).asFileRequests).toEqual([true, false]);
  await page.evaluate((name) => {
    window.richMediaComposerHarness.finishDocument(0, {name, size: 1234567, mimeType: 'application/pdf'});
    window.richMediaComposerHarness.finishDocument(1, {name: 'track.mp3', size: 3456789, mimeType: 'audio/mpeg', type: 'audio'});
  }, name);
  const rows = page.locator('.chat-input-rich-media-item-row');
  const more = rows.locator('.chat-input-rich-media-more');
  await expect(more).toHaveCount(2);
  await expect(rows.nth(1).locator('.audio-toggle')).toBeVisible();

  const measured = await rows.evaluateAll((elements) => {
    const box = (element: Element) => element.getBoundingClientRect();
    const field = elements[0].closest('.input-message-input');
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    while(walker.nextNode() && walker.currentNode.textContent !== 'Before');
    const text = document.createRange();
    text.selectNodeContents(walker.currentNode);
    return {
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      textStart: text.getBoundingClientRect().left,
      button: box(field.closest('.new-message-wrapper').querySelector('.message-input-editor-toolbar-button')).toJSON(),
      rows: elements.map((row) => ({
        row: box(row).toJSON(),
        icon: box(row.querySelector('.document-ico, .audio-toggle')).toJSON(),
        name: box(row.querySelector('.document-name, .audio-title')).toJSON(),
        more: box(row.querySelector('.chat-input-rich-media-more')).toJSON()
      }))
    };
  });
  for(const [index, {row, icon, name, more}] of measured.rows.entries()) {
    // a file's icon and an audio's play button both start where the text does
    expect(icon.left, `${index}: icon`).toBeCloseTo(measured.textStart, 0);
    // round, the size of the composer's every other button
    expect(more.width, `${index}: menu width`).toBeCloseTo(measured.button.width, 0);
    expect(more.height, `${index}: menu height`).toBeCloseTo(measured.button.height, 0);
    expect(more.top + more.height / 2, `${index}: menu mid-row`).toBeCloseTo(row.top + row.height / 2, 0);
    expect(row.right - more.right, `${index}: menu inset`).toBeCloseTo(measured.rem, 0);
    expect(name.right, `${index}: the name keeps clear of the menu`).toBeLessThanOrEqual(more.left);
  }

  // a file has nothing to edit, replace or group: removing it is all, and nothing is set apart
  await more.first().click();
  const menu = page.locator('.btn-menu.active');
  await expect(menu.getByRole('menuitem', {name: 'Remove media'})).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  await expect(menu.getByRole('separator')).toHaveCount(0);
});

test('a file in the editor is only shown: a click puts the caret in its caption, as on a photo, and downloads nothing', async({page}) => {
  // the keyboard layer is where the file's icon would turn into an "open" button
  await open(page, {a11y: true});
  await page.evaluate(async() => {
    const path = '/src/lib/appDownloadManager.ts';
    const {default: appDownloadManager} = await window.e2eImport(path);
    const downloads: string[] = (window as any).downloads = [];
    for(const method of ['downloadToDisc', 'downloadMedia', 'downloadMediaURL'] as const) {
      const download = appDownloadManager[method].bind(appDownloadManager);
      (appDownloadManager as any)[method] = (...args: Parameters<typeof download>) => {
        downloads.push(method);
        return download(...args);
      };
    }
  });
  await page.evaluate(() => window.richMediaComposerHarness.setText('Before'));
  expect(await insertFiles(page, [{name: PDF.name, type: PDF.mimeType, size: PDF.size}])).toBe(true);
  await expect.poll(async() => (await state(page)).uploads).toBe(1);
  await page.evaluate((file) => window.richMediaComposerHarness.finishDocument(0, file), PDF);
  const row = page.locator('.chat-input-rich-media-item-row');
  await expect(row).toContainText('2.2 MB');

  // nothing on the row offers to open it: its only control is the menu
  await expect(row.getByRole('button')).toHaveCount(1);
  await expect(row.getByRole('button')).toHaveAccessibleName('More');
  // nor looks like it would
  expect(await row.evaluate((element) => [
    getComputedStyle(element.querySelector('.document')).cursor,
    getComputedStyle(element.closest('.input-message-input')).cursor
  ]).then(([file, field]) => file === field)).toBe(true);

  for(const part of ['.document-name', '.document-ico']) {
    await row.locator(part).click();
    await expect.poll(() => page.evaluate(() => {
      const anchor = document.getSelection().anchorNode;
      return !!(anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('[data-rich-caption]');
    }), part).toBe(true);
  }
  expect(await page.evaluate(() => (window as any).downloads)).toEqual([]);
});

test('a file\'s and an audio\'s upload fade out over the very row they drew, and nothing of the rows is text to select', async({page}) => {
  await open(page);
  await page.evaluate(() => window.richMediaComposerHarness.setText('Before'));
  expect(await insertFiles(page, [{name: PDF.name, type: PDF.mimeType, size: PDF.size}])).toBe(true);
  expect(await insertFiles(page, [{name: 'track.mp3', type: 'audio/mpeg', size: 3456}])).toBe(true);
  await expect.poll(async() => (await state(page)).asFileRequests).toEqual([true, false]);
  // the rings are up while the bytes go: a preloader shows a frame or two after it is attached, and
  // an upload finished before that has no ring to fade
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.chat-input-rich-media-item-row')].map((row) => (
    !!row.querySelector('.document-ico .preloader-container.is-visible, .audio-download .preloader-container.is-visible')
  )))).toEqual([true, true]);

  // as in the chat: the row stays as it was drawn, and its ring fades out over it once its line has come
  // round to the end (a second at most)
  for(const [index, file] of [
    [0, PDF],
    [1, {name: 'track.mp3', size: 3456, mimeType: 'audio/mpeg', type: 'audio' as const}]
  ] as const) {
    const finished = await page.evaluate(({index, file}) => new Promise<{sameRow: boolean, fading: boolean, gone: boolean, animations: boolean}>((resolve) => {
      const row = document.querySelectorAll('.chat-input-rich-media-item-row')[index];
      const start = performance.now();
      let fading = false;
      window.richMediaComposerHarness.finishDocument(index, file);
      const sample = () => {
        // the row's own ring, as a bubble's: on a file's icon, over an audio's play button; its fade
        // is an opacity transition, seen whatever the frame rate
        const ring = row.querySelector('.audio-download') || row.querySelector('.document-ico .preloader-container');
        fading ||= !!ring?.getAnimations().some((animation) => (
          (animation as CSSTransition).transitionProperty === 'opacity' && animation.playState === 'running'
        ));
        if(performance.now() - start < 1600) requestAnimationFrame(sample);
        else resolve({sameRow: row.isConnected, fading, gone: !ring, animations: document.body.classList.contains('animation-level-2')});
      };
      requestAnimationFrame(sample);
    }), {index, file});
    expect(finished.sameRow, `${index}: the same row`).toBe(true);
    // with animations off the ring just goes, as everywhere; in WebKit the wrappers' shared preloader
    // runs no transition as a file's ring goes
    if(test.info().project.name !== 'webkit') {
      expect(finished.fading, `${index}: fading`).toBe(finished.animations);
    }
    expect(finished.gone, `${index}: gone`).toBe(true);
  }

  const rows = page.locator('.chat-input-rich-media-item-row');
  await expect(rows.nth(1).locator('.audio-toggle')).toBeVisible();
  for(const [index, name] of [[0, '.document-name'], [1, '.audio-title']] as const) {
    const box = await rows.nth(index).locator(name).boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {steps: 8});
    await page.mouse.up();
    expect(await page.evaluate(() => document.getSelection().toString()), `${index}: selected`).toBe('');
  }
});

test('a file\'s or an audio\'s row shows its upload as a bubble does, and its ring cancels it', async({page}) => {
  await open(page);
  await page.evaluate(() => window.richMediaComposerHarness.setText('Before'));
  expect(await insertFiles(page, [{name: PDF.name, type: PDF.mimeType, size: PDF.size}])).toBe(true);
  expect(await insertFiles(page, [{name: 'track.mp3', type: 'audio/mpeg', size: 3456}])).toBe(true);
  await expect.poll(async() => (await state(page)).uploads).toBe(2);
  const rows = page.locator('.chat-input-rich-media-item-row');

  // how far it has got, where a bubble shows it
  await page.evaluate(() => window.richMediaComposerHarness.progress(0, 1000000, 2345678));
  await expect(rows.nth(0).locator('.document-size')).toContainText('977 KB / 2.2 MB');

  // the ring cancels, and the block goes as with the editor's own cancel: Undo can bring it back
  for(const [ring, block] of [['.audio-download .preloader-container', 'pageBlockAudio'], ['.document-ico .preloader-container', 'pageBlockDocument']] as const) {
    await page.locator(`.chat-input-rich-media-item-row ${ring}`).click();
    await expect.poll(() => mediaBlocks(page), ring).not.toContain(block);
  }
  expect(await mediaBlocks(page)).toEqual([]);
  expect((await state(page)).tasks).toBe(2);
});

test('two files dropped together are two file blocks, never a collage', async({page}) => {
  await open(page);
  expect(await insertFiles(page, [
    {name: 'a.pdf', type: 'application/pdf'},
    {name: 'b.zip', type: 'application/zip'}
  ])).toBe(true);
  await expect.poll(() => mediaBlocks(page)).toEqual(['pageBlockDocument', 'pageBlockDocument']);
  await expect(page.locator('.chat-input-rich-media-item-row')).toHaveCount(2);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
});

test('a file that failed to upload offers to try again or remove it, and keeps offering', async({page}) => {
  await open(page);
  expect(await insertFiles(page, [{name: PDF.name, type: PDF.mimeType, size: PDF.size}])).toBe(true);
  await expect.poll(async() => (await state(page)).uploads).toBe(1);
  await page.evaluate(() => window.richMediaComposerHarness.finish(0, false));

  const row = page.locator('.chat-input-rich-media-item-row');
  const actions = row.getByRole('button', {name: /Try Again|Remove/});
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toBeVisible();
  // the progress gives way to them
  await expect(row.locator('.chat-input-rich-media-upload-progress')).toBeHidden();

  // someone else touching the node's own DOM (an extension, a test's screenshot hiding the caret) is
  // nothing for the editor to read back: the node is not redrawn and the failure is not forgotten
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-rich-media] [contenteditable="false"]').forEach((element) => {
      element.style.setProperty('caret-color', 'transparent');
    });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))));
  await expect(actions).toHaveCount(2);
  await page.evaluate(() => window.richMediaComposerHarness.destroy());
});

test('a file of a rich message draws as a document row with its caption', async({page}) => {
  await open(page);
  await page.evaluate(async(file) => {
    const path = '/e2e/fixtures/richPage.ts';
    const {mountRichPage} = await window.e2eImport(path);
    mountRichPage([
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Before the file'}},
      {_: 'pageBlockDocument', document_id: '5001', caption: {
        _: 'pageCaption', text: {_: 'textPlain', text: 'The numbers'}, credit: {_: 'textEmpty'}
      }}
    ], [{
      _: 'document', pFlags: {}, id: '5001', access_hash: '1', file_reference: new Uint8Array(), date: 0, dc_id: 2,
      size: file.size, mime_type: file.mimeType, file_name: file.name,
      attributes: [{_: 'documentAttributeFilename', file_name: file.name}]
    }]);
  }, PDF);
  const page_ = page.locator('[data-rich-page]');
  await expect(page_.locator('.document-name')).toHaveText(PDF.name);
  await expect(page_.locator('.document-ico')).toContainText('pdf');
  // its size and nothing dangling after it; small enough to download by itself, the row may already
  // be counting that ("0 B / 2.2 MB")
  expect((await page_.locator('.document-size').innerText()).trim()).toMatch(/(^|\/ )2\.2 MB$/);
  await expect(page_).toContainText('The numbers');
});

test('an audio of a rich message shows its whole name when the line has room for it', async({page}) => {
  await open(page);
  const title = 'Clair de lune.flac';
  await page.evaluate(async(title) => {
    const path = '/e2e/fixtures/richPage.ts';
    const {mountRichPage} = await window.e2eImport(path);
    mountRichPage([
      {_: 'pageBlockAudio', audio_id: '5002', caption: {
        _: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}
      }}
    ], [{
      _: 'document', pFlags: {}, id: '5002', access_hash: '1', file_reference: new Uint8Array(), date: 0, dc_id: 2,
      size: 4567890, mime_type: 'audio/flac', file_name: title, type: 'audio', duration: 300,
      attributes: [
        {_: 'documentAttributeAudio', pFlags: {}, duration: 300, title, performer: 'Debussy'},
        {_: 'documentAttributeFilename', file_name: title}
      ]
    }]);
  }, title);
  const line = page.locator('[data-rich-page] .audio-title-text');
  await expect(line).toContainText('Debussy');
  // the name shares its line with the performer and is drawn whole, with no ellipsis of its own
  const name = line.locator('middle-ellipsis-element');
  await expect.poll(() => name.textContent()).toBe(title);
  expect(await name.getAttribute('title')).toBeNull();
});
