import {describe, expect, it} from 'vitest';
import type {PageBlock, RichText} from '@layer';
import {
  getReplyQuote,
  getRichQuoteNodes,
  getRichQuoteSelectionBoundaries,
  getRichQuoteTextWithEntities,
  makeRichQuote,
  RichQuoteNode
} from '@lib/richQuote';

// * the cases of Telegram for iOS' RichReplyQuoteTests: what the server takes for a quote of a rich message

const plain = (text: string): RichText => ({_: 'textPlain', text});
const bold = (text: RichText): RichText => ({_: 'textBold', text});
const italic = (text: RichText): RichText => ({_: 'textItalic', text});
const concat = (...texts: RichText[]): RichText => ({_: 'textConcat', texts});
const math = (source: string): RichText => ({_: 'textMath', source});
const emoji = (alt: string): RichText => ({_: 'textCustomEmoji', document_id: 1, alt});
const paragraph = (text: RichText): PageBlock => ({_: 'pageBlockParagraph', text});
const caption = (text: string, credit: string) => ({_: 'pageCaption' as const, text: plain(text), credit: plain(credit)});
const cell = (text: string): any => ({_: 'pageTableCell', pFlags: {}, text: plain(text)});

const quote = (nodes: RichQuoteNode[], start: [number, number], end: [number, number], maxLength = 1024) => {
  return makeRichQuote(nodes, {index: start[0], offset: start[1]}, {index: end[0], offset: end[1]}, maxLength);
};

const specNodes = () => getRichQuoteNodes([
  paragraph(concat(plain('Релиз в '), bold(plain('пятницу')), plain(', не опаздывать'))),
  paragraph(plain('Созвон по ссылке в календаре'))
]);

describe('rich quotes', () => {
  it('quotes the end of the first text, the start of the last one', () => {
    const result = quote(specNodes(), [0, 8], [1, 9]);
    expect(result.fragments).toEqual([concat(bold(plain('пятницу')), plain(', не опаздывать')), plain('Созвон по')]);
    expect(result.offset).toBe(8);
    expect(getRichQuoteTextWithEntities(result.fragments).text).toBe('пятницу, не опаздывать\nСозвон по');
  });

  it('cuts a text on both sides when it is all of the selection', () => {
    const result = quote(specNodes(), [0, 2], [0, 12]);
    expect(result.fragments).toEqual([concat(plain('лиз в '), bold(plain('пятн')))]);
    expect(result.offset).toBe(2);
  });

  it('keeps the texts between whole', () => {
    const middle = concat(italic(plain('mid ')), {_: 'textUrl', text: plain('link'), url: 'https://t.me', webpage_id: 0});
    const nodes = getRichQuoteNodes([paragraph(plain('first')), paragraph(middle), paragraph(plain('last'))]);
    const result = quote(nodes, [0, 2], [2, 2]);
    expect(result.fragments).toEqual([plain('rst'), middle, plain('la')]);
    expect(result.offset).toBe(2);
  });

  it('takes the texts in the order of the node table', () => {
    const text = (value: string) => plain(value);
    const nodes = getRichQuoteNodes([
      {_: 'pageBlockHeading1', text: text('h')},
      {_: 'pageBlockList', items: [
        {_: 'pageListItemText', pFlags: {}, text: text('li')},
        {_: 'pageListItemBlocks', pFlags: {}, blocks: [paragraph(text('lb'))]}
      ]},
      {_: 'pageBlockBlockquoteBlocks', blocks: [paragraph(text('q'))], caption: text('qc')},
      {_: 'pageBlockPullquote', text: text('p'), caption: text('pc')},
      {_: 'pageBlockTable', pFlags: {}, title: text('tt'), rows: [
        {_: 'pageTableRow', cells: [cell('a'), cell('b')]},
        {_: 'pageTableRow', cells: [cell('c')]}
      ]},
      {_: 'pageBlockDetails', pFlags: {}, title: text('dt'), blocks: [paragraph(text('d'))]},
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: caption('ct', 'cc')},
      {_: 'pageBlockCollage', items: [{_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: caption('it', 'ic')}], caption: caption('ct2', 'cc2')},
      {_: 'pageBlockMath', source: 'x'},
      {_: 'pageBlockDivider'},
      {_: 'pageBlockAnchor', name: 'a'},
      {_: 'pageBlockDocument', document_id: 1, caption: caption('dc', 'dd')},
      {_: 'pageBlockTitle', text: text('t')},
      {_: 'pageBlockFooter', text: text('f')},
      {_: 'pageBlockThinking', text: text('th')},
      {_: 'pageBlockPreformatted', text: text('code'), language: ''}
    ]);
    expect(nodes.map((node) => node.flat)).toEqual([
      'h', 'li', 'lb', 'q', 'qc', 'p', 'pc', 'tt', 'a', 'b', 'c', 'dt', 'd', 'ct', 'cc', 'it', 'ic', 'ct2', 'cc2',
      'x', 'f', 'th', 'code'
    ]);
    expect(nodes[19].text).toEqual(math('x'));
    // * where each stands, as what draws it says: iOS' InstantPageTextNodeId (path of the block, part of it)
    expect(nodes.map((node) => node.id)).toEqual([
      '0:text', '1.0:text', '1.1.0:text', '2.0:text', '2:caption', '3:text', '3:caption',
      '4:title', '4:cell:0,0', '4:cell:0,1', '4:cell:1,0', '5:title', '5.0:text', '6:caption', '6:credit',
      '7.0:caption', '7.0:credit', '7:caption', '7:credit', '8:text', '13:text', '14:text', '15:text'
    ]);
  });

  it('leaves out texts that read nothing', () => {
    const nodes = getRichQuoteNodes([
      paragraph(plain('')),
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}},
      {_: 'pageBlockTable', pFlags: {}, title: {_: 'textEmpty'}, rows: [{_: 'pageTableRow', cells: [{_: 'pageTableCell', pFlags: {}}]}]},
      paragraph({_: 'textImage', document_id: 2, w: 1, h: 1}),
      paragraph(plain('x'))
    ]);
    expect(nodes.map((node) => node.flat)).toEqual(['x']);
  });

  it('never cuts an atom', () => {
    // * "a x^2 b 👍 c": the formula is 2..<5, the emoji 8..<10
    const nodes = getRichQuoteNodes([paragraph(concat(plain('a '), math('x^2'), plain(' b '), emoji('👍'), plain(' c')))]);
    const intoFormula = quote(nodes, [0, 3], [0, 4]);
    expect(intoFormula.fragments).toEqual([concat(math('x^2'))]);
    expect(intoFormula.offset).toBe(2);
    const intoEmoji = quote(nodes, [0, 9], [0, 12]);
    expect(intoEmoji.fragments).toEqual([concat(emoji('👍'), plain(' c'))]);
    expect(intoEmoji.offset).toBe(8);
  });

  it('quotes a button as its label, and no picture', () => {
    const button: RichText = {_: 'textButton', text: bold(plain('Go')), type: {_: 'inlineButtonTypeUrl', url: ''} as any};
    const image: RichText = {_: 'textImage', document_id: 1, w: 1, h: 1};
    const nodes = getRichQuoteNodes([paragraph(plain('x')), paragraph(concat(plain('a'), button, image, plain('b'))), paragraph(plain('y'))]);
    expect(quote(nodes, [0, 0], [2, 1]).fragments).toEqual([plain('x'), concat(plain('a'), plain('Go'), plain('b')), plain('y')]);
  });

  it('takes the texts a closed details hides whole', () => {
    const nodes = getRichQuoteNodes([
      paragraph(plain('before')),
      {_: 'pageBlockDetails', pFlags: {}, title: plain('title'), blocks: [paragraph(plain('hidden'))]},
      paragraph(plain('after'))
    ]);
    expect(quote(nodes, [0, 3], [3, 2]).fragments).toEqual([plain('ore'), plain('title'), plain('hidden'), plain('af')]);
  });

  it('leaves out spaces and line breaks at its ends, the offset moving', () => {
    const nodes = getRichQuoteNodes([paragraph(plain('Hello world')), paragraph(plain('  next'))]);
    const result = quote(nodes, [0, 5], [1, 2]);
    expect(result.fragments).toEqual([plain('world')]);
    expect(result.offset).toBe(6);
  });

  it('takes boundaries given end first', () => {
    expect(quote(specNodes(), [1, 9], [0, 8])).toEqual(quote(specNodes(), [0, 8], [1, 9]));
  });

  it('keeps to the limits', () => {
    const many = getRichQuoteNodes(Array.from({length: 40}, () => paragraph(plain('p'))));
    expect(quote(many, [0, 0], [39, 1]).fragments.length).toBe(32);

    const long = getRichQuoteNodes([paragraph(plain('a'.repeat(2000)))]);
    expect(getRichQuoteTextWithEntities(quote(long, [0, 0], [0, 2000]).fragments).text.length).toBe(1024);

    const two = getRichQuoteNodes([paragraph(plain('aaaa')), paragraph(plain('bbbb'))]);
    expect(quote(two, [0, 0], [1, 4], 6).fragments).toEqual([plain('aaaa'), plain('b')]);
  });

  it('cuts at the limit where no atom or emoji is split', () => {
    const nodes = getRichQuoteNodes([paragraph(concat(plain('abc'), math('xyz')))]);
    expect(quote(nodes, [0, 0], [0, 6], 4).fragments).toEqual([concat(plain('abc'))]);
    const pair = getRichQuoteNodes([paragraph(plain('ab😀'))]);
    expect(quote(pair, [0, 0], [0, 4], 3).fragments).toEqual([plain('ab')]);
  });

  it('takes the first and the last text in the message, whatever the order they were drawn in', () => {
    // * a table's cell spanning rows is laid out after the cells of its last row: A, B, C laid out as B, A, C
    const bounds = getRichQuoteSelectionBoundaries([{index: 1, from: 2, to: 4}, {index: 0, from: 0, to: 1}]);
    expect(bounds).toEqual({start: {index: 0, offset: 0}, end: {index: 1, offset: 4}});
    const throughC = getRichQuoteSelectionBoundaries([{index: 1, from: 2, to: 4}, {index: 0, from: 0, to: 4}, {index: 2, from: 0, to: 2}]);
    expect(throughC).toEqual({start: {index: 0, offset: 0}, end: {index: 2, offset: 2}});
    expect(getRichQuoteSelectionBoundaries([])).toBeUndefined();
  });

  it('ends before what cannot be read', () => {
    const nodes = getRichQuoteNodes([paragraph(plain('aa')), {_: 'pageBlockUnsupported'}, paragraph(plain('bb'))]);
    expect(nodes.map((node) => !!node.afterUnknown)).toEqual([false, true]);
    expect(quote(nodes, [0, 1], [1, 2]).fragments).toEqual([plain('a')]);
    expect(quote(nodes, [1, 1], [1, 2]).fragments).toEqual([plain('b')]);
  });

  it('keeps grapheme clusters whole', () => {
    const skin = getRichQuoteNodes([paragraph(plain('ab👍🏽'))]);
    expect(quote(skin, [0, 0], [0, 6], 4).fragments).toEqual([plain('ab')]);
    const flag = getRichQuoteNodes([paragraph(plain('ab🇺🇦cd'))]);
    const result = quote(flag, [0, 4], [0, 8]);
    expect(result.fragments).toEqual([plain('🇺🇦cd')]);
    expect(result.offset).toBe(2);
  });

  it('leaves out spaces before a cut at the limit', () => {
    const nodes = getRichQuoteNodes([paragraph(plain('aaaa')), paragraph(plain('bb  cc'))]);
    expect(quote(nodes, [0, 0], [1, 6], 8).fragments).toEqual([plain('aaaa'), plain('bb')]);
  });

  it('reads as text with the formatting a quote keeps', () => {
    const fragments = [concat(plain('a '), bold(plain('b')), {_: 'textUrl', text: plain('c'), url: 'https://t.me', webpage_id: 0}), emoji('👍')];
    const {text, entities} = getRichQuoteTextWithEntities(fragments);
    expect(text).toBe('a bc\n👍');
    // * no link: a quote keeps the formatting a quote of a text does
    expect(entities.filter((entity) => entity._ !== 'messageEntityEmoji')).toEqual([
      {_: 'messageEntityBold', offset: 2, length: 1},
      {_: 'messageEntityCustomEmoji', offset: 5, length: 2, document_id: 1}
    ]);
  });

  it('reads a reply\'s rich quote before its text', () => {
    const fragments = [plain('x')];
    expect(getReplyQuote({_: 'messageReplyHeader', pFlags: {quote: true}, quote_rich: fragments, quote_offset: 3})).toEqual({
      text: 'x', entities: [], offset: 3, rich: fragments
    });
    expect(getReplyQuote({_: 'messageReplyHeader', pFlags: {quote: true}, quote_text: 'y', quote_offset: 1})).toEqual({
      text: 'y', entities: undefined, offset: 1
    });
    expect(getReplyQuote({_: 'messageReplyHeader', pFlags: {}})).toBeUndefined();
  });
});
