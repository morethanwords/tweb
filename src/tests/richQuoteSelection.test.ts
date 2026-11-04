import {afterEach, describe, expect, it, vi} from 'vitest';
import type {PageBlock} from '@layer';

// * copying a message's text, which the module that aligns drawn text with it does too, is not what is checked here
vi.mock('@helpers/prepareTextWithEntitiesForCopying', () => ({default: vi.fn()}));

import {setRichQuotePage, setRichQuoteSource} from '@components/chat/richQuoteSources';
import {getRichQuoteSelection, getRichQuoteTextOffset, makeRichQuoteOfSelection} from '@components/chat/richQuoteSelection';

const getRichQuoteFromSelection = (range: Range, maxLength: number) => {
  const selected = getRichQuoteSelection(range);
  return selected && makeRichQuoteOfSelection(selected, maxLength);
};

// * a selection in a rich message as it is drawn, made into its quote: each drawn text known by where it stands in the
// * message, its offsets those of what it reads

const paragraph = (text: string): PageBlock => ({_: 'pageBlockParagraph', text: {_: 'textPlain', text}});

function drawPage(blocks: PageBlock[], texts: {id?: string, text: string}[]) {
  const page = document.createElement('div');
  setRichQuotePage(page, () => blocks);
  const elements = texts.map(({id, text}) => {
    const element = document.createElement('span');
    element.textContent = text;
    if(id) setRichQuoteSource(element, () => id);
    page.append(element);
    return element;
  });
  document.body.append(page);
  return elements;
}

function select(element: HTMLElement, from: number, to: number) {
  const range = document.createRange();
  range.setStart(element.firstChild, from);
  range.setEnd(element.firstChild, to);
  return range;
}

describe('a rich quote of a selection', () => {
  afterEach(() => document.body.replaceChildren());

  it('takes an emoji the renderer completed as it reads in the message', () => {
    // * `❤` is drawn `❤️` (`fixEmoji`): the quote's offset is in what the message reads
    const [element] = drawPage([paragraph('I ❤ text')], [{id: '0:text', text: 'I ❤️ text'}]);
    const quote = getRichQuoteFromSelection(select(element, 5, 9), 1024);
    expect(quote.rich).toEqual([{_: 'textPlain', text: 'text'}]);
    expect(quote.offset).toBe(4);
  });

  it('knows a text by where it stands, not by what it reads', () => {
    // * a file's caption, drawn but no text a quote takes, reads as the paragraph after it does
    const blocks: PageBlock[] = [
      {_: 'pageBlockDocument', document_id: 1, caption: {_: 'pageCaption', text: {_: 'textPlain', text: 'same'}, credit: {_: 'textEmpty'}}},
      paragraph('same')
    ];
    const [, element] = drawPage(blocks, [{text: 'same'}, {id: '1:text', text: 'same'}]);
    const quote = getRichQuoteFromSelection(select(element, 0, 4), 1024);
    expect(quote.rich).toEqual([{_: 'textPlain', text: 'same'}]);
    expect(quote.offset).toBe(0);
  });

  it('takes a text with a picture in it, which reads nothing', () => {
    // * a picture is drawn as a custom emoji of no text of its own (`\x01`, `wrapTelegramRichText`)
    const blocks: PageBlock[] = [{_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [
      {_: 'textPlain', text: 'a '},
      {_: 'textImage', document_id: 1, w: 1, h: 1},
      {_: 'textPlain', text: ' word'}
    ]}}];
    const page = document.createElement('div');
    setRichQuotePage(page, () => blocks);
    const element = document.createElement('span');
    const picture = document.createElement('span');
    picture.dataset.stickerEmoji = '\x01';
    element.append('a ', picture, ' word');
    setRichQuoteSource(element, () => '0:text');
    page.append(element);
    document.body.append(page);
    const range = document.createRange();
    range.setStart(element.lastChild, 1);
    range.setEnd(element.lastChild, 5);
    const quote = getRichQuoteFromSelection(range, 1024);
    expect(quote.text).toBe('word');
    // * "a " and the picture, which reads nothing, before it
    expect(quote.offset).toBe(3);
  });

  it('takes a custom emoji of an emoji the renderer completes', () => {
    const blocks: PageBlock[] = [{_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [
      {_: 'textCustomEmoji', document_id: 1, alt: '❤'},
      {_: 'textPlain', text: ' word'}
    ]}}];
    const page = document.createElement('div');
    setRichQuotePage(page, () => blocks);
    const element = document.createElement('span');
    const emoji = document.createElement('span');
    emoji.dataset.stickerEmoji = '❤️';
    element.append(emoji, ' word');
    setRichQuoteSource(element, () => '0:text');
    page.append(element);
    document.body.append(page);
    const range = document.createRange();
    range.setStart(element.lastChild, 1);
    range.setEnd(element.lastChild, 5);
    const quote = getRichQuoteFromSelection(range, 1024);
    expect(quote.text).toBe('word');
    expect(quote.offset).toBe(2);
  });

  it('takes a code block as it reads, nothing of it completed', () => {
    const blocks: PageBlock[] = [{_: 'pageBlockPreformatted', text: {_: 'textPlain', text: '❤ word'}, language: ''}];
    const [element] = drawPage(blocks, [{id: '0:text', text: '❤ word'}]);
    const quote = getRichQuoteFromSelection(select(element, 2, 6), 1024);
    expect(quote.rich).toEqual([{_: 'textPlain', text: 'word'}]);
    expect(quote.offset).toBe(2);
  });

  it('completes an emoji over the whole text, as the renderer does', () => {
    // * `❤` and its selector in two texts of one: the renderer completes the whole, which needs nothing put in
    const blocks: PageBlock[] = [{_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [
      {_: 'textPlain', text: 'I ❤'},
      {_: 'textPlain', text: '\ufe0f word'}
    ]}}];
    const [element] = drawPage(blocks, [{id: '0:text', text: 'I ❤\ufe0f word'}]);
    const quote = getRichQuoteFromSelection(select(element, 5, 9), 1024);
    expect(quote.text).toBe('word');
    expect(quote.offset).toBe(5);
  });

  it('finds where a quote starts in the drawn text, which has no line breaks between the texts', () => {
    drawPage([paragraph('a'), paragraph('a'), paragraph('a')], [
      {id: '0:text', text: 'a'}, {id: '1:text', text: 'a'}, {id: '2:text', text: 'a'}
    ]);
    // * the middle one: 2 in "a\na\na", 1 in "aaa"
    expect(getRichQuoteTextOffset(document.body.firstElementChild.parentElement, 2)).toBe(1);
    expect(getRichQuoteTextOffset(document.body.firstElementChild.parentElement, 4)).toBe(2);
  });

  it('finds where a quote starts in a text drawn longer, or with a line break drawn as none', () => {
    // * "❤❤ aaa aaa" is drawn "❤️❤️ aaa aaa": the second "aaa", at 7 in the text, is at 9 in the drawing
    drawPage([paragraph('❤❤ aaa aaa')], [{id: '0:text', text: '❤️❤️ aaa aaa'}]);
    expect(getRichQuoteTextOffset(document.body, 7)).toBe(9);
    document.body.replaceChildren();

    const [element] = drawPage([paragraph('one\ntwo')], [{id: '0:text', text: 'one'}]);
    element.append(document.createElement('br'), 'two');
    expect(getRichQuoteTextOffset(document.body, 4)).toBe(3);
  });

  it('takes the texts between the ends whole', () => {
    const blocks = [paragraph('one'), paragraph('two'), paragraph('three')];
    const [first, , last] = drawPage(blocks, [{id: '0:text', text: 'one'}, {id: '1:text', text: 'two'}, {id: '2:text', text: 'three'}]);
    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(last.firstChild, 2);
    const quote = getRichQuoteFromSelection(range, 1024);
    expect(quote.text).toBe('ne\ntwo\nth');
    expect(quote.offset).toBe(1);
  });
});
