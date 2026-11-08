import {afterEach, describe, expect, it} from 'vitest';
import type {JSONContent} from '@tiptap/core';
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
});
