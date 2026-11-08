import {afterEach, describe, expect, it} from 'vitest';
import type {JSONContent} from '@tiptap/core';
import {TextSelection} from '@tiptap/pm/state';
import type {PageBlock, RichText} from '@layer';
import {useChatInputEditorHarness, type TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import {concat, plain} from '@/tests/helpers/richText';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {setRichQuotePage, setRichQuoteSource} from '@components/chat/richQuoteSources';
import {listenRichMessageCopy} from '@components/chat/richMessageCopy';

// * a selection in a rich message as it is drawn, copied by the client and pasted into the composer

const customEmoji: RichText = {_: 'textCustomEmoji', document_id: '5431456208487716895', alt: '🎨'};
const blocks: PageBlock[] = [
  {_: 'pageBlockHeading2', text: concat(customEmoji, plain(' A new look'))},
  {_: 'pageBlockParagraph', text: plain('Web K got a softer design')}
];

/** The page as `instantView` draws it: the heading's custom emoji an element of no text of its own */
function drawPage() {
  const page = document.createElement('div');
  setRichQuotePage(page, () => blocks);
  const heading = document.createElement('h2');
  const emoji = document.createElement('span');
  emoji.dataset.stickerEmoji = '🎨';
  heading.append(emoji, ' A new look');
  setRichQuoteSource(heading, () => '0:text');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Web K got a softer design';
  setRichQuoteSource(paragraph, () => '1:text');
  page.append(heading, paragraph);
  document.body.append(page);
  return {page, heading, paragraph};
}

function copy(range: Range) {
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const data: Map<string, string> = new Map();
  const event = new Event('copy', {cancelable: true});
  Object.defineProperty(event, 'clipboardData', {value: {setData: (type: string, value: string) => data.set(type, value)}});
  document.dispatchEvent(event);
  return {copied: event.defaultPrevented, text: data.get('text/plain'), html: data.get('text/html')};
}

const content = (json: JSONContent) => json.content.filter((node) => node.content || node.type !== 'paragraph');

describe('a selection of a rich message, copied and pasted', () => {
  const {mountEditor} = useChatInputEditorHarness();
  const mount = (plainOnly?: boolean) => {
    const {editor} = mountEditor(undefined, {plainOnly});
    return {editor, tiptap: (editor as TiptapEditorInternals).editor};
  };
  listenRichMessageCopy();
  afterEach(() => document.body.replaceChildren());

  it('pastes a heading as a heading, its custom emoji in it, with no weight of the drawn heading', () => {
    const {heading, paragraph} = drawPage();
    const range = document.createRange();
    range.setStart(heading, 0);
    range.setEnd(paragraph.firstChild, 9);
    const {copied, text, html} = copy(range);
    expect(copied).toBe(true);
    expect(text).toBe('🎨 A new look\nWeb K got');

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(content(tiptap.getJSON())).toEqual([{
      type: 'heading',
      attrs: expect.objectContaining({level: 2}),
      content: [
        {type: 'customEmoji', attrs: {documentId: '5431456208487716895', emoji: '🎨'}},
        {type: 'text', text: ' A new look'}
      ]
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: 'Web K got'}]
    }]);
  });

  it('pastes the flat text into a field that carries no heading', () => {
    const {heading, paragraph} = drawPage();
    const range = document.createRange();
    range.setStart(heading, 0);
    range.setEnd(paragraph.firstChild, 9);
    const {html} = copy(range);

    const {editor, tiptap} = mount(true);
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    const value = editor.getRichValue();
    expect(value.value).toBe('🎨 A new look\nWeb K got');
    expect(value.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({_: 'messageEntityCustomEmoji', offset: 0}),
      expect.objectContaining({_: 'messageEntityBold', offset: 0})
    ]));
  });

  it('leaves a selection that goes on past the message to the browser', () => {
    const {heading} = drawPage();
    const after = document.createElement('div');
    after.textContent = 'another message';
    document.body.append(after);
    const range = document.createRange();
    range.setStart(heading, 0);
    range.setEnd(after.firstChild, 7);
    expect(copy(range).copied).toBe(false);
  });

  it('leaves to the browser a selection that starts in text that is none of the message\'s, a file\'s caption', () => {
    const {page, paragraph} = drawPage();
    // * drawn as `instantView` draws a file's caption: no text a selection counts
    const fileCaption = document.createElement('div');
    fileCaption.textContent = 'a file';
    page.insertBefore(fileCaption, paragraph);
    const range = document.createRange();
    range.setStart(fileCaption.firstChild, 2);
    range.setEnd(paragraph.firstChild, 9);
    expect(copy(range).copied).toBe(false);

    // * past its end the selection is the message's again
    range.setStart(fileCaption.firstChild, 6);
    expect(copy(range)).toMatchObject({copied: true, text: 'Web K got'});
  });

  it('leaves to the browser a selection whose last text is a file\'s caption, though it ends between elements', () => {
    const {page, heading} = drawPage();
    const range = document.createRange();
    range.setStart(heading, 0);
    range.setEnd(page, page.childNodes.length);
    expect(copy(range)).toMatchObject({copied: true, text: '🎨 A new look\nWeb K got a softer design'});

    const fileCaption = document.createElement('div');
    fileCaption.textContent = 'a file';
    page.append(fileCaption);
    range.setEnd(page, page.childNodes.length);
    expect(copy(range).copied).toBe(false);
  });

  it('pastes of what any page can write only texts, no pictures and no blocks it cannot read', () => {
    const written: PageBlock[] = [
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: {_: 'pageCaption', text: plain('a caption'), credit: {_: 'textEmpty'}}},
      {_: 'pageBlockUnsupported'},
      {_: 'pageBlockParagraph', text: concat(plain('a '), {_: 'textImage', document_id: 1, w: 1, h: 1}, plain('picture'))}
    ];
    const {html} = prepareTextWithEntitiesForCopying({text: 'a caption\na picture', entities: []}, undefined, written);

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(content(tiptap.getJSON())).toEqual([
      {type: 'paragraph', content: [{type: 'text', text: 'a caption'}]},
      {type: 'paragraph', content: [{type: 'text', text: 'a picture'}]}
    ]);
  });

  it('pastes a whole message\'s file caption and its row of buttons as their texts', () => {
    const button = (text: string) => ({_: 'pageButton' as const, text: plain(text), type: {_: 'inlineButtonTypeUrl' as const, url: 'https://telegram.org'}});
    const written: PageBlock[] = [
      {_: 'pageBlockHeading2', text: plain('Files')},
      {_: 'pageBlockDocument', document_id: 1, caption: {_: 'pageCaption', text: plain('a file'), credit: {_: 'textEmpty'}}},
      {_: 'pageBlockButtonRow', pFlags: {}, buttons: [button('One'), button('Two')]}
    ];
    const {html} = prepareTextWithEntitiesForCopying({text: 'Files\na file\nOne Two', entities: []}, undefined, written);

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(content(tiptap.getJSON())).toEqual([
      {type: 'heading', attrs: expect.objectContaining({level: 2}), content: [{type: 'text', text: 'Files'}]},
      {type: 'paragraph', content: [{type: 'text', text: 'a file'}]},
      {type: 'paragraph', content: [{type: 'text', text: 'One Two'}]}
    ]);
  });

  it('pastes a bot\'s markdown list numbered as it was', () => {
    const item = (text: string, num: string) => ({_: 'pageListOrderedItemText' as const, pFlags: {}, num, text: plain(text)});
    const written: PageBlock[] = [{_: 'pageBlockOrderedList', pFlags: {}, items: [item('seven', '7'), item('eight', '8')]}];
    const {html} = prepareTextWithEntitiesForCopying({text: '7. seven\n8. eight', entities: []}, undefined, written);

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    const [list] = content(tiptap.getJSON());
    expect(list.type).toBe('orderedList');
    expect(list.attrs.start).toBe(7);
    expect(list.content.map((node) => node.attrs?.value ?? null)).toEqual([null, null]);
  });

  it('pastes a list whose markers the field cannot keep as its flat text, the markers in it', () => {
    const item = (text: string, num: string) => ({_: 'pageListOrderedItemText' as const, pFlags: {}, num, text: plain(text)});
    const written: PageBlock[] = [{_: 'pageBlockOrderedList', pFlags: {}, items: [item('four', 'iv'), item('five', 'v')]}];
    const {html} = prepareTextWithEntitiesForCopying({text: 'iv. four\nv. five', entities: []}, undefined, written);

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(content(tiptap.getJSON()).map((node) => [node.type, node.content.map((text) => text.text).join('')])).toEqual([
      ['paragraph', 'iv. four'],
      ['paragraph', 'v. five']
    ]);
  });

  it('pastes a table as one table, its title in it', () => {
    const written: PageBlock[] = [{_: 'pageBlockTable', pFlags: {}, title: plain('Title'), rows: [
      {_: 'pageTableRow', cells: [{_: 'pageTableCell', pFlags: {}, text: plain('a')}]}
    ]}];
    const {html} = prepareTextWithEntitiesForCopying({text: 'Title\na', entities: []}, undefined, written);

    const {tiptap} = mount();
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    const tables = content(tiptap.getJSON());
    expect(tables.map((node) => node.type)).toEqual(['chatTableWrapper']);
    expect(tables[0].content.map((node) => node.type)).toEqual(['chatTableTitle', 'table']);
    expect(tables[0].content[0].content).toEqual([{type: 'text', text: 'Title'}]);
  });

  it('pastes a quote into a quote as its text, its author a line after it', () => {
    const written: PageBlock[] = [{_: 'pageBlockBlockquote', pFlags: {}, text: plain('said'), caption: plain('Author')}];
    const {html} = prepareTextWithEntitiesForCopying({text: 'said\nAuthor', entities: []}, undefined, written);

    const {editor, tiptap} = mount();
    editor.setDocument({type: 'doc', content: [{type: 'blockquote', content: [{type: 'paragraph'}]}]});
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 2)));
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    const quote: JSONContent = tiptap.getJSON().content[0];
    expect(quote.type).toBe('blockquote');
    const lines = quote.content.filter((node) => node.content).map((node) => [node.type, node.content.map((text) => text.text).join('')]);
    expect(lines).toEqual([
      ['paragraph', 'said'],
      ['paragraph', '— Author']
    ]);
  });
});
