import {openEditor, settleNativeSelection as settle} from './fixtures/chatInputEditorTest';
import {expect, test} from '@playwright/test';
import type {ChatInputEditorBrowserHarness} from './fixtures/chatInputEditor';
import {createChatInputEditorTestData} from '@components/chat/inputEditor/testData';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('copies table title text alone and together with a cell', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertStructuralBlock('table'))).toBe(true);
  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('chatTableTitle'))).toBe(true);
  await page.keyboard.insertText('Metrics');
  const title = (await page.evaluate(() => window.chatInputEditorHarness.nodePositions('chatTableTitle')))[0];
  expect(await page.evaluate((title) => window.chatInputEditorHarness.setTextSelection(title + 1, title + 8), title)).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.clipboard())).text).toBe('Metrics');

  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0))).toBe(true);
  await page.keyboard.insertText('Cell');
  const cell = (await page.evaluate(() => window.chatInputEditorHarness.nodePositions('paragraph')))[0];
  expect(await page.evaluate(({title, cell}) => window.chatInputEditorHarness.setTextSelection(title + 2, cell + 2), {title, cell})).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.clipboard())).text).toBe('etrics\nC');
});

test('retains custom emoji in clipboard HTML outside tables', async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
    type: 'paragraph', content: [
      {type: 'text', text: 'A'},
      {type: 'customEmoji', attrs: {documentId: '42', emoji: '🔥'}},
      {type: 'text', text: 'B'}
    ]
  }]}));
  expect(await page.evaluate(() => window.chatInputEditorHarness.setTextSelection(1, 4))).toBe(true);
  const clipboard = await page.evaluate(() => window.chatInputEditorHarness.clipboard());
  expect(clipboard.text).toBe('A🔥B');
  expect(clipboard.html).toContain('data-doc-id="42"');
});

for(const reversed of [false, true]) test(`preserves copied list numbering with reversed=${reversed}`, async({page}) => {
  await page.evaluate((reversed) => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
    type: 'orderedList', attrs: {start: 7, startExplicit: true, reversed},
    content: ['First', 'Second', 'Third'].map((text) => ({
      type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text}]}]
    }))
  }]}), reversed);
  const surfaces = await page.evaluate(() => window.chatInputEditorHarness.textblocks());
  await page.evaluate(({from, to}) => window.chatInputEditorHarness.setTextSelection(from, to), {
    from: surfaces.find(({text}) => text === 'Second')!.from,
    to: surfaces.find(({text}) => text === 'Third')!.to
  });
  const copied = await page.evaluate(() => {
    const fragment = window.chatInputEditorHarness.selectedRichMessage();
    const clipboard = window.chatInputEditorHarness.clipboard();
    const template = document.createElement('template');
    template.innerHTML = clipboard.html;
    const list = template.content.querySelector('ol')!;
    return {fragment, text: clipboard.text, start: list.start, reversed: list.reversed};
  });
  expect(copied.start).toBe(reversed ? 6 : 8);
  expect(copied.reversed).toBe(reversed);
  expect(copied.text).toBe(reversed ? '6. Second\n5. Third' : '8. Second\n9. Third');
  expect(copied.fragment!.output.blocks[0]).toMatchObject({start: reversed ? 6 : 8});
});

test('replaces selected rich fragments across adjacent visible surfaces without changing the message', async({page}) => {
  test.setTimeout(90_000);
  const document = createChatInputEditorTestData({includeLocalMediaPreview: false});
  await page.evaluate((document) => window.chatInputEditorHarness.setDocument(document), document);
  await settle(page);
  const surfaces = (await page.evaluate(() => window.chatInputEditorHarness.textblocks()))
  .filter((surface) => surface.visible && surface.to - surface.from > 2);
  for(let index = 0; index < surfaces.length - 1; ++index) {
    await test.step(`${surfaces[index].type} -> ${surfaces[index + 1].type}`, async() => {
      await page.evaluate((document) => window.chatInputEditorHarness.setDocument(document), document);
      await page.evaluate(({from, to}) => window.chatInputEditorHarness.setTextSelection(from, to), {
        from: surfaces[index].from + 1,
        to: surfaces[index + 1].to - 1
      });
      await settle(page);
      const before = await page.evaluate(() => window.chatInputEditorHarness.richMessage());
      const fragment = await page.evaluate(() => window.chatInputEditorHarness.selectedRichMessage());
      expect(fragment).toBeTruthy();
      expect(await page.evaluate((message) => window.chatInputEditorHarness.replaceSelectionWithRichMessage(message), fragment!.output)).toBe(true);
      await settle(page);
      expect(await page.evaluate(() => window.chatInputEditorHarness.richMessage())).toEqual(before);
    });
  }
});

for(const expanded of [false, true]) for(const author of ['', 'Author']) test(`copies quote content without a placeholder newline (expanded=${expanded}, author=${JSON.stringify(author)})`, async({page}) => {
  const original = {type: 'doc', content: [
    {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
    {type: 'blockquote', content: [
      {type: 'paragraph', content: [{type: 'text', text: 'Quote'}]},
      ...(author ? [{type: 'blockquoteCaption', content: [{type: 'text', text: author}]}] : [])
    ]},
    {type: 'paragraph', content: [{type: 'text', text: 'After'}]}
  ]};
  await page.evaluate(({original, expanded}) => {
    window.chatInputEditorHarness.setDocument(original);
    window.chatInputEditorHarness.setExpanded(expanded);
  }, {original, expanded});
  await page.locator('#editor').focus();
  await page.keyboard.press('ControlOrMeta+a');
  const copied = await page.evaluate(() => window.chatInputEditorHarness.clipboard());
  expect(copied.text).toBe(`Before\nQuote${author ? '\nAuthor' : ''}\nAfter`);
  expect(copied.html.includes('data-blockquote-caption-content')).toBe(!!author);
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{type: 'paragraph'}]}));
  expect(await page.evaluate(html => window.chatInputEditorHarness.pasteHTML(html), copied.html)).toBe(true);
  const quote = await page.locator('[data-chat-input-blockquote]').count();
  expect(quote).toBe(1);
  await page.locator('#editor').focus();
  await page.keyboard.press('ControlOrMeta+a');
  const copiedAgain = await page.evaluate(() => window.chatInputEditorHarness.clipboard());
  expect(copiedAgain.text).toBe(copied.text);
});

for(const kind of ['photo', 'video', 'audio', 'collage', 'slideshow', 'map']) test(`HTML clipboard preserves ${kind} caption and credit`, async({page}) => {
  await page.evaluate((kind) => {
    const caption = {_: 'pageCaption', text: {_: 'textPlain', text: 'Caption'}, credit: {_: 'textPlain', text: 'Credit'}};
    const photo = {_: 'pageBlockPhoto', pFlags: {}, photo_id: '123', caption};
    const block = kind === 'map' ? {_: 'pageBlockMap', geo: {_: 'geoPoint', access_hash: '0', lat: 20, long: 0}, w: 400, h: 200, zoom: 2, caption} :
      kind === 'photo' ? photo : kind === 'video' ?
      {_: 'pageBlockVideo', pFlags: {}, video_id: '124', caption} : kind === 'audio' ?
        {_: 'pageBlockAudio', audio_id: '125', caption} :
        {_: kind === 'collage' ? 'pageBlockCollage' : 'pageBlockSlideshow', items: [photo, photo], caption};
    window.chatInputEditorHarness.setDocument({type: 'doc', content: [{type: kind === 'map' ? 'richMap' : 'richMedia',
      attrs: {block, captionCredit: caption.credit, photos: [], documents: []},
      content: [{type: 'text', text: 'Caption', marks: [{type: 'bold'}]}, {type: 'hardBreak'}, {type: 'text', text: 'Tail'}]
    }]});
    window.chatInputEditorHarness.setExpanded(true);
  }, kind);
  await page.locator('#editor').focus();
  await page.keyboard.press('ControlOrMeta+a');
  const before = await page.evaluate(() => window.chatInputEditorHarness.richMessage());
  const copied = await page.evaluate(() => window.chatInputEditorHarness.clipboard());
  expect(await page.evaluate(html => window.chatInputEditorHarness.pasteHTML(html), copied.html)).toBe(true);
  expect(await page.evaluate(() => window.chatInputEditorHarness.richMessage())).toEqual(before);
});
