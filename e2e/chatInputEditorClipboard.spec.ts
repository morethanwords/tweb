import {openEditor, settleNativeSelection as settle} from './fixtures/chatInputEditorTest';
import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {ChatInputEditorBrowserHarness} from './fixtures/chatInputEditor';
import {createChatInputEditorTestData} from '@components/chat/inputEditor/testData';
import type {MessageEntity} from '@layer';

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

for(const linebreak of ['\n', '\r\n']) test(`pasted plain text keeps every line, blank ones too (${JSON.stringify(linebreak)})`, async({page}) => {
  const lines = ['Order', '', '', '', 'Here:', '', 'Cash on delivery'];
  expect(await page.evaluate((text) => window.chatInputEditorHarness.pasteClipboard({text}), lines.join(linebreak))).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.value())).value).toBe(lines.join('\n'));
});

test('a message copied from the chat pastes back with its lines and spaces', async({page}) => {
  const text = 'Order !!!\n\n\n\nHere:  two spaces  \n  indented\nCash on delivery';
  const copied = await page.evaluate((text) => window.chatInputEditorHarness.messageClipboard({text, entities: []}), text);
  expect(copied.text).toBe(text);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.value())).value).toBe(text);
});

test('messages copied together paste back as their plain text says, a sender\'s name as text', async({page}) => {
  const copied = await page.evaluate(() => window.chatInputEditorHarness.messageClipboard([
    {text: 'One\nTwo', entities: []},
    {text: 'Three', entities: []}
  ], ['<b>Ann</b>, [01.02.26 10:00]', 'Bob, [01.02.26 10:01]']));
  expect(copied.text).toBe('<b>Ann</b>, [01.02.26 10:00]\nOne\nTwo\n\nBob, [01.02.26 10:01]\nThree');
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);
  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(copied.text);
  expect(pasted.entities).toEqual([]);
});

// an entity of any type, placed by the part of the text it is given with
type UnplacedEntity = MessageEntity extends infer Entity ? Entity extends MessageEntity ? Omit<Entity, 'offset' | 'length'> : never : never;

/** A message as the server sends it: its text, and its entities in the order of their offsets */
function buildMessage(parts: (string | [string, ...UnplacedEntity[]])[]) {
  let text = '';
  const entities: MessageEntity[] = [];
  for(const part of parts) {
    const [str, ...partEntities] = typeof(part) === 'string' ? [part] : part;
    partEntities.forEach((entity) => entities.push({...entity, offset: text.length, length: str.length} as MessageEntity));
    text += str;
  }
  return {text, entities};
}

// what the field holds as a mention's user id is the text of its `data-follow`
const sortedEntities = (entities: MessageEntity[]) => entities
.map((entity) => entity._ === 'messageEntityMentionName' ? {...entity, user_id: String(entity.user_id)} : entity)
.sort((a, b) => a.offset - b.offset || a.length - b.length || a._.localeCompare(b._));

const FORMATTED_MESSAGE = buildMessage([
  ['Bold', {_: 'messageEntityBold'}], ' ',
  ['Italic', {_: 'messageEntityItalic'}], ' ',
  ['Under', {_: 'messageEntityUnderline'}], ' ',
  ['Strike', {_: 'messageEntityStrike'}], ' ',
  ['code', {_: 'messageEntityCode'}], ' ',
  ['Spoiler', {_: 'messageEntitySpoiler'}], ' ',
  ['Link', {_: 'messageEntityTextUrl', url: 'https://example.com/'}], ' ',
  ['Ann', {_: 'messageEntityMentionName', user_id: 42}], ' ',
  ['both', {_: 'messageEntityBold'}, {_: 'messageEntityItalic'}], ' ',
  ['🔥', {_: 'messageEntityCustomEmoji', document_id: '5'}], ' ',
  ['10:00', {_: 'messageEntityFormattedDate', date: 1767261600, pFlags: {short_time: true}}], '\n',
  ['Quoted\nlines', {_: 'messageEntityBlockquote', pFlags: {}}], '\n',
  ['const a = 1;', {_: 'messageEntityPre', language: 'js'}], '\n',
  ['plain pre', {_: 'messageEntityPre', language: ''}], '\n',
  ['Folded', {_: 'messageEntityBlockquote', pFlags: {collapsed: true}}], '\n',
  // found in the text by the client and the server alike, so not something a draft sends
  '@durov #tag https://t.me/x /start'
]);

for(const via of ['paste event', 'system clipboard']) test(`a message copied from the chat pastes back with its formatting (${via})`, async({page, browserName}) => {
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), FORMATTED_MESSAGE);
  expect(copied.text).toBe(FORMATTED_MESSAGE.text);
  if(via === 'paste event') {
    expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);
  } else {
    test.skip(browserName !== 'chromium', 'clipboard permissions are granted over CDP');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate((copied) => window.chatInputEditorHarness.copyToClipboard(copied), copied);
    await page.locator('#editor').focus();
    await page.keyboard.press('ControlOrMeta+v');
  }

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(FORMATTED_MESSAGE.text);
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities(FORMATTED_MESSAGE.entities));
});

test('a copied message\'s HTML says its formatting in tags any app reads', async({page}) => {
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), FORMATTED_MESSAGE);
  for(const tag of ['<strong>Bold</strong>', '<em>Italic</em>', '<u>Under</u>', '<s>Strike</s>', '<code>code</code>', '<blockquote', '<code data-language="js">']) {
    expect(copied.html).toContain(tag);
  }
  // a draft's format is a font family no other app has
  expect(copied.html).not.toMatch(/markup-(bold|italic|underline|strikethrough|monospace|quote)/);
});

test('messages copied together keep their formatting after their senders\' names', async({page}) => {
  const first = buildMessage([['Bold', {_: 'messageEntityBold'}], ' one\n', ['quote', {_: 'messageEntityBlockquote', pFlags: {}}]]);
  const second = buildMessage([['x = 1', {_: 'messageEntityPre', language: 'py'}]]);
  const heads = ['Ann, [01.02.26 10:00]', 'Bob, [01.02.26 10:01]'];
  const copied = await page.evaluate(({messages, heads}) => window.chatInputEditorHarness.messageClipboard(messages, heads), {messages: [first, second], heads});
  const text = `${heads[0]}\n${first.text}\n\n${heads[1]}\n${second.text}`;
  expect(copied.text).toBe(text);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(text);
  const shift = (entities: MessageEntity[], by: number) => entities.map((entity) => ({...entity, offset: entity.offset + by}));
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities([
    ...shift(first.entities, text.indexOf(first.text)),
    ...shift(second.entities, text.lastIndexOf(second.text))
  ]));
});

test('a code block inside a line of a copied message pastes back inside it', async({page}) => {
  const message = buildMessage(['before ', ['x = 1', {_: 'messageEntityPre', language: 'py'}], ' after\nnext']);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(message.text);
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities(message.entities));
});

test('a code block ending with its line break keeps the empty line after it', async({page}) => {
  const message = buildMessage([['x\n', PRE], '\ny']);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(message.text);
  expect(pasted.entities).toEqual(message.entities);
});

test('a copied quote edited elsewhere pastes with its lines, not a blank one around it', async({page}) => {
  const message = buildMessage(['before\n', ['quote', QUOTE], '\nafter']);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(copied.html).toContain('after<');
  const edited = {html: copied.html.replace('after<', 'AFTER<'), text: 'before\nquote\nAFTER'};
  expect(await page.evaluate((edited) => window.chatInputEditorHarness.pasteClipboard(edited), edited)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe('before\nquote\nAFTER');
  expect(pasted.entities).toEqual([{...QUOTE, offset: 7, length: 5}]);
});

test('a copied message given a line more elsewhere pastes as its HTML is now', async({page}) => {
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), buildMessage([['one', {_: 'messageEntityBold'}], '\ntwo']));
  expect(copied.html).toContain('<br>two');
  const edited = {html: copied.html.replace('<br>two', '<br><br>two'), text: 'one\n\ntwo'};
  expect(await page.evaluate((edited) => window.chatInputEditorHarness.pasteClipboard(edited), edited)).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.value())).value).toBe('one\n\ntwo');
});

// another app may keep the wrapper and its metadata while changing what the HTML says
for(const {name, edit, value, entities} of [
  {name: 'its bold taken off', edit: ['<strong>Bold</strong>', 'Bold'], value: 'Bold Link', entities: [
    {_: 'messageEntityTextUrl', offset: 5, length: 4, url: 'https://old.example/'}
  ]},
  {name: 'its link pointed to another address', edit: ['https://old.example/', 'https://new.example/'], value: 'Bold Link', entities: [
    {_: 'messageEntityBold', offset: 0, length: 4},
    {_: 'messageEntityTextUrl', offset: 5, length: 4, url: 'https://new.example/'}
  ]}
] as {name: string, edit: [string, string], value: string, entities: MessageEntity[]}[]) test(`a copied message with ${name} in another app pastes as its HTML is now`, async({page}) => {
  const message = buildMessage([['Bold', {_: 'messageEntityBold'}], ' ', ['Link', {_: 'messageEntityTextUrl', url: 'https://old.example/'}]]);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  // the HTML after the wrapper's metadata, which holds the link's address too
  const [from, to] = edit;
  const at = copied.html.lastIndexOf(from);
  expect(at).toBeGreaterThan(copied.html.indexOf('">'));
  const edited = {html: copied.html.slice(0, at) + to + copied.html.slice(at + from.length), text: copied.text};
  expect(await page.evaluate((edited) => window.chatInputEditorHarness.pasteClipboard(edited), edited)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(value);
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities(entities));
});

test('a copied quote in a right-to-left language keeps reading its own way', async({page}) => {
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), buildMessage([['مرحبا!', QUOTE]]));
  expect(copied.html).toContain('<blockquote dir="auto"');
});

test('a copied message\'s entities that are not whole ranges of its text are not taken', async({page}) => {
  // what any page can put on the clipboard: a range that never ends a loop over it must not hang the paste
  const json = JSON.stringify({text: 'abc', entities: [{_: 'messageEntityPre', offset: 1, length: 1e-17, language: ''}]});
  const html = `<span data-text-with-entities="${json.replace(/"/g, '&quot;')}">abc</span>`;
  expect(await page.evaluate((html) => window.chatInputEditorHarness.pasteClipboard({html, text: 'abc'}), html)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe('abc');
  expect(pasted.entities).toEqual([]);
});

// a paragraph's edge joins the line the copy is pasted into; a quote or a code block stays whole
const PRE: Omit<MessageEntity.messageEntityPre, 'offset' | 'length'> = {_: 'messageEntityPre', language: ''};
const QUOTE: Omit<MessageEntity.messageEntityBlockquote, 'offset' | 'length'> = {_: 'messageEntityBlockquote', pFlags: {}};
for(const {name, parts, at, value, entity} of [
  {name: 'a code block', parts: [['x = 1', PRE]], at: 'A|B', value: 'A\nx = 1\nB', entity: {...PRE, offset: 2, length: 5}},
  {name: 'a code block', parts: [['x = 1', PRE]], at: '|', value: 'x = 1', entity: {...PRE, offset: 0, length: 5}},
  {name: 'a quote', parts: [['Quoted', QUOTE]], at: 'A|B', value: 'A\nQuoted\nB', entity: {...QUOTE, offset: 2, length: 6}},
  {name: 'text and a code block', parts: ['text\n', ['x = 1', PRE]], at: 'A|B', value: 'Atext\nx = 1\nB', entity: {...PRE, offset: 6, length: 5}}
] as {name: string, parts: Parameters<typeof buildMessage>[0], at: string, value: string, entity: MessageEntity}[]) test(`${name} copied from the chat pastes into ${JSON.stringify(at)} as a block`, async({page}) => {
  const [before, after] = at.split('|');
  if(before || after) {
    await page.evaluate((text) => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
      type: 'paragraph', content: [{type: 'text', text}]
    }]}), before + after);
    expect(await page.evaluate((position) => window.chatInputEditorHarness.setTextSelection(position, position), 1 + before.length)).toBe(true);
  }

  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), buildMessage(parts));
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(value);
  expect(pasted.entities).toEqual([entity]);
});

// quotes do not nest: into a quote, a copied quote is its text, and the rest of the copy stays in that quote
for(const {name, parts, value} of [
  {name: 'a quote', parts: [['Quoted', QUOTE]], value: 'AQuotedB'},
  {name: 'a quote and text after it', parts: [['Quoted', QUOTE], '\ntail'], value: 'AQuoted\ntailB'},
  {name: 'text and a quote after it', parts: ['head\n', ['Quoted', QUOTE]], value: 'Ahead\nQuotedB'}
] as {name: string, parts: Parameters<typeof buildMessage>[0], value: string}[]) test(`${name} copied from the chat pastes into a quote as its text`, async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
    type: 'blockquote', content: [{type: 'paragraph', content: [{type: 'text', text: 'AB'}]}]
  }]}));
  const [{from}] = (await page.evaluate(() => window.chatInputEditorHarness.textblocks())).filter(({text}) => text === 'AB');
  expect(await page.evaluate((position) => window.chatInputEditorHarness.setTextSelection(position, position), from + 1)).toBe(true);

  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), buildMessage(parts));
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(value);
  expect(pasted.entities).toEqual([{...QUOTE, offset: 0, length: value.length}]);
});

test('a quote copied from the chat stays a quote pasted into a quote\'s author line', async({page}) => {
  await page.evaluate(() => {
    window.chatInputEditorHarness.setDocument({type: 'doc', content: [{type: 'blockquote', content: [
      {type: 'paragraph', content: [{type: 'text', text: 'Q'}]},
      {type: 'blockquoteCaption', content: [{type: 'text', text: 'AB'}]}
    ]}]});
    window.chatInputEditorHarness.setExpanded(true);
  });
  const [{from}] = (await page.evaluate(() => window.chatInputEditorHarness.textblocks())).filter(({text}) => text === 'AB');
  expect(await page.evaluate((position) => window.chatInputEditorHarness.setTextSelection(position, position), from + 1)).toBe(true);

  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), buildMessage(['head\n', ['Quoted', QUOTE]]));
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  // the author line is a quote's last: what follows a line there goes after the quote
  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.entities).toContainEqual({...QUOTE, offset: pasted.value.indexOf('Quoted'), length: 6});
});

test('a copied message pasted over a whole selected table is the message, not that table', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertStructuralBlock('table'))).toBe(true);
  expect(await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph', 0))).toBe(true);
  await page.keyboard.insertText('Cell');
  // the first Select All takes the cell's text, the second the table's cells
  for(let i = 0; i < 2; ++i) {
    await page.keyboard.press('ControlOrMeta+a');
    await settle(page);
  }
  expect((await page.evaluate(() => window.chatInputEditorHarness.selection())).type).toBe('cell');

  const message = buildMessage([['Pasted', {_: 'messageEntityBold'}], ' text']);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);
  expect((await page.evaluate(() => window.chatInputEditorHarness.value())).value).toContain('Pasted text');
});

test('a copied message edited elsewhere pastes as its HTML is now, not as it was copied', async({page}) => {
  const message = buildMessage([['Bold', {_: 'messageEntityBold'}], ' ', ['code', {_: 'messageEntityCode'}], ' tail']);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(copied.html).toContain(' tail<');
  const edited = {html: copied.html.replace(' tail<', ' end<'), text: 'Bold code end'};
  expect(await page.evaluate((edited) => window.chatInputEditorHarness.pasteClipboard(edited), edited)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe('Bold code end');
  // the HTML still says where the inline code is
  expect(pasted.entities).toContainEqual({_: 'messageEntityCode', offset: 5, length: 4});
});

test('a copied message pasted inside a line joins it', async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{
    type: 'paragraph', content: [{type: 'text', text: 'AB'}]
  }]}));
  expect(await page.evaluate(() => window.chatInputEditorHarness.setTextSelection(2, 2))).toBe(true);
  const message = buildMessage([['bold', {_: 'messageEntityBold'}], ' ', ['code', {_: 'messageEntityCode'}]]);
  const copied = await page.evaluate((message) => window.chatInputEditorHarness.messageClipboard(message), message);
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe('Abold codeB');
  expect(sortedEntities(pasted.entities)).toEqual([
    {_: 'messageEntityBold', offset: 1, length: 4},
    {_: 'messageEntityCode', offset: 6, length: 4}
  ]);
});

test('a mention and a code block copied out of the field paste back as they were', async({page}) => {
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [
    {type: 'paragraph', content: [
      {type: 'text', text: 'Ann', marks: [{type: 'mentionName', attrs: {userId: '42'}}]},
      {type: 'text', text: ' and '},
      {type: 'text', text: 'Link', marks: [{type: 'link', attrs: {href: 'https://example.com/'}}]}
    ]},
    {type: 'codeBlock', attrs: {language: 'js'}, content: [{type: 'text', text: 'const a = 1;'}]},
    {type: 'codeBlock', attrs: {language: ''}, content: [{type: 'text', text: 'plain'}]}
  ]}));
  const before = await page.evaluate(() => window.chatInputEditorHarness.value());
  await page.locator('#editor').focus();
  await page.keyboard.press('ControlOrMeta+a');
  const copied = await page.evaluate(() => window.chatInputEditorHarness.clipboard());
  await page.evaluate(() => window.chatInputEditorHarness.setDocument({type: 'doc', content: [{type: 'paragraph'}]}));
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe('Ann and Link\nconst a = 1;\nplain');
  expect(pasted.value).toBe(before.value);
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities([
    {_: 'messageEntityMentionName', offset: 0, length: 3, user_id: 42},
    {_: 'messageEntityTextUrl', offset: 8, length: 4, url: 'https://example.com/'},
    {_: 'messageEntityPre', offset: 13, length: 12, language: 'js'},
    {_: 'messageEntityPre', offset: 26, length: 5, language: ''}
  ]));
});

/**
 * Selects the drawn message's text from the character `from` of the first occurrence of `start`
 * (or of the text in the `startIn` element, its end with `fromEnd`) to the character `to` of the
 * first occurrence of `end` after it (or the start of the text in the `endIn` element); a missing
 * start or end stands for that edge of the bubble's message element, its time included (a triple
 * click)
 */
async function selectInMessage(page: Page, selection: {
  start?: string,
  startIn?: string,
  from?: number,
  fromEnd?: boolean,
  end?: string,
  endIn?: string,
  to?: number
}) {
  await page.evaluate(({start, startIn, from = 0, fromEnd, end, endIn, to = 0}) => {
    const root = document.getElementById('message-text');
    const message = root.closest('.message');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while(walker.nextNode()) nodes.push(walker.currentNode as Text);
    const find = (needle: string, after?: Text) => nodes.slice(after ? nodes.indexOf(after) : 0).find((node) => node.data.includes(needle));
    const range = document.createRange();
    const startNode = startIn ? root.querySelector(startIn).firstChild as Text : start && find(start);
    if(startNode) range.setStart(startNode, fromEnd ? startNode.data.length : (start ? startNode.data.indexOf(start) : 0) + from);
    else range.setStart(message, 0);
    const endNode = endIn ? root.querySelector(endIn).firstChild as Text : end && find(end, startNode);
    if(endNode) range.setEnd(endNode, (end ? endNode.data.indexOf(end) : 0) + to);
    else range.setEnd(message, message.childNodes.length);
    (document.activeElement as HTMLElement)?.blur();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, selection);
}

/** What a copy put on the clipboard, read in the copy event once the app has handled it */
async function copySelection(page: Page, browserName: string) {
  // WebKit on Linux sends no copy for the shortcut when nothing has the focus: the event is the same
  if(browserName === 'webkit') return page.evaluate(() => {
    const clipboardData = new DataTransfer();
    document.body.dispatchEvent(new ClipboardEvent('copy', {clipboardData, bubbles: true, cancelable: true}));
    return {html: clipboardData.getData('text/html'), text: clipboardData.getData('text/plain')};
  });

  await page.evaluate(() => window.addEventListener('copy', (e) => {
    (window as any).copied = {html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain')};
  }, {once: true}));
  await page.keyboard.press('ControlOrMeta+c');
  return page.evaluate(() => (window as any).copied as {html: string, text: string});
}

/** The entities of `text` between `start` and `end`, each cut to its part there */
function cutEntities(entities: MessageEntity[], start: number, end: number) {
  return entities
  .filter((entity) => entity.offset < end && entity.offset + entity.length > start)
  .map((entity) => {
    const from = Math.max(entity.offset, start), to = Math.min(entity.offset + entity.length, end);
    return {...entity, offset: from - start, length: to - from};
  });
}

test('a selection that takes a reply\'s text with the message\'s is the browser\'s to copy', async({page, browserName}) => {
  await page.evaluate((message) => window.chatInputEditorHarness.drawMessage(message, {reply: 'Replied to'}), FORMATTED_MESSAGE);
  await page.evaluate(() => {
    const reply = document.querySelector('.reply').firstChild as Text;
    const bold = document.querySelector('#message-text strong').firstChild as Text;
    const range = document.createRange();
    range.setStart(reply, 0);
    range.setEnd(bold, 2);
    (document.activeElement as HTMLElement)?.blur();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  // the app puts nothing on the clipboard in the event: the browser copies the selection after it
  expect(await copySelection(page, browserName)).toEqual({html: '', text: ''});
});

test('a selection that takes a reply\'s emoji with the message\'s text is the browser\'s to copy', async({page, browserName}) => {
  const emoji = '<img class="emoji" alt="🔥" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">';
  await page.evaluate(({message, emoji}) => window.chatInputEditorHarness.drawMessage(message, {reply: emoji}), {message: FORMATTED_MESSAGE, emoji});
  await page.evaluate(() => {
    const bold = document.querySelector('#message-text strong').firstChild as Text;
    const range = document.createRange();
    range.setStart(document.querySelector('.reply'), 0);
    range.setEnd(bold, 2);
    (document.activeElement as HTMLElement)?.blur();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  expect(await copySelection(page, browserName)).toEqual({html: '', text: ''});
});

test('a selection in a message shown otherwise than its text (a translation) is the browser\'s to copy', async({page, browserName}) => {
  // the translation starts as the text does, and goes on
  const message = buildMessage([['Hello', {_: 'messageEntityBold'}]]);
  const shown = buildMessage([['Hello', {_: 'messageEntityBold'}], ' world']);
  await page.evaluate(({message, shown}) => window.chatInputEditorHarness.drawMessage(message, {shown}), {message, shown});
  await selectInMessage(page, {});
  expect(await copySelection(page, browserName)).toEqual({html: '', text: ''});
});

const DATE_OFFSET = FORMATTED_MESSAGE.text.indexOf('10:00');
for(const selection of [
  {name: 'all of it, by a triple click'},
  // highlighted, the code's first word is a text node of its own
  {name: 'from inside a word to inside a code block', start: 'Italic', from: 2, end: 'const', to: 5},
  // a date is drawn as the local time: a selection starting in it takes it whole, as its text in the message
  {name: 'from inside a date', startIn: '.formatted-date', from: 2, end: 'Quoted', to: 6, textStart: DATE_OFFSET},
  // at an edge of the date nothing of it is selected
  {name: 'from the end of a date', startIn: '.formatted-date', fromEnd: true, end: 'Quoted', to: 6, textStart: DATE_OFFSET + 5},
  {name: 'up to the start of a date', start: 'both', endIn: '.formatted-date', textEnd: DATE_OFFSET}
]) test(`a selection in a message copies its part with the formatting: ${selection.name}`, async({page, browserName}) => {
  const {text, entities} = FORMATTED_MESSAGE;
  await page.evaluate((message) => window.chatInputEditorHarness.drawMessage(message), FORMATTED_MESSAGE);
  // the code is highlighted after it is drawn, its text put anew: a selection set before loses its end there
  await page.waitForFunction(() => document.querySelector('#message-text code .prism-token'));
  const start = selection.textStart ?? (selection.start ? text.indexOf(selection.start) + (selection.from ?? 0) : 0);
  const end = selection.textEnd ?? (selection.end ? text.indexOf(selection.end) + (selection.to ?? 0) : text.length);

  await selectInMessage(page, selection);
  const copied = await copySelection(page, browserName);
  expect(copied.text).toBe(text.slice(start, end));
  expect(await page.evaluate((copied) => window.chatInputEditorHarness.pasteClipboard(copied), copied)).toBe(true);

  const pasted = await page.evaluate(() => window.chatInputEditorHarness.value());
  expect(pasted.value).toBe(text.slice(start, end));
  expect(sortedEntities(pasted.entities)).toEqual(sortedEntities(cutEntities(entities, start, end)));
});
