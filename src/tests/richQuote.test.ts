import {describe, expect, it} from 'vitest';
import type {PageBlock, PageListOrderedItem, RichText} from '@layer';
import {concat, emoji, plain} from '@/tests/helpers/richText';
import {getRichTextFlatText as getRichTextFlatTextOf, richMessageToPlainMessage} from '@lib/richMessage';
import {
  getReplyQuote,
  getRichQuoteNodes,
  getRichQuoteSelectionBoundaries,
  getRichQuoteTextWithEntities,
  makeRichQuote,
  mapRichQuoteTexts,
  normalizeRichQuoteFragment,
  RichQuoteNode,
  sliceRichQuoteBlocks
} from '@lib/richQuote';

// * the cases of Telegram for iOS' RichReplyQuoteTests: what the server takes for a quote of a rich message

const bold = (text: RichText): RichText => ({_: 'textBold', text});
const italic = (text: RichText): RichText => ({_: 'textItalic', text});
const math = (source: string): RichText => ({_: 'textMath', source});
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

describe('what a selection of a rich message copies', () => {
  const heading = (text: RichText): PageBlock => ({_: 'pageBlockHeading2', text});
  const copy = (blocks: PageBlock[], start: [number, number], end: [number, number]) => sliceRichQuoteBlocks(
    blocks,
    getRichQuoteNodes(blocks),
    {index: start[0], offset: start[1]},
    {index: end[0], offset: end[1]}
  );

  it('keeps a heading a heading, a custom emoji in it, and cuts the last text where it is left', () => {
    const blocks = [
      paragraph(plain('before')),
      heading(concat(emoji('🎨'), plain(' A new look'))),
      paragraph(plain('Web K got a softer design'))
    ];
    expect(copy(blocks, [1, 0], [2, 9])).toEqual([
      heading(concat(emoji('🎨'), plain(' A new look'))),
      paragraph(plain('Web K got'))
    ]);
  });

  it('keeps a list of the items taken, numbered as they were', () => {
    const item = (text: string) => ({_: 'pageListOrderedItemText' as const, pFlags: {}, text: plain(text)});
    const list: PageBlock = {_: 'pageBlockOrderedList', pFlags: {}, items: [item('one'), item('two'), item('three')]};
    expect(copy([list], [1, 1], [2, 5])).toEqual([
      {_: 'pageBlockOrderedList', pFlags: {}, items: [item('wo'), item('three')], start: 2}
    ]);
  });

  it('keeps a quote with its author, a table of the rows taken, and a picture as its caption', () => {
    const blocks: PageBlock[] = [
      {_: 'pageBlockBlockquote', pFlags: {}, text: plain('said'), caption: plain('someone')},
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: caption('a photo', '')},
      {_: 'pageBlockTable', pFlags: {}, title: plain(''), rows: [
        {_: 'pageTableRow', cells: [cell('a'), cell('b')]},
        {_: 'pageTableRow', cells: [cell('c'), cell('d')]}
      ]}
    ];
    // * from the quote to "a" of the table
    expect(copy(blocks, [0, 0], [3, 1])).toEqual([
      blocks[0],
      paragraph(plain('a photo')),
      {...blocks[2], rows: [{_: 'pageTableRow', cells: [cell('a'), {...cell('b'), text: {_: 'textEmpty'}}]}]}
    ]);
  });

  it('leaves out a picture in a text, and copies a button as its label', () => {
    const blocks = [paragraph(concat(
      plain('see '),
      {_: 'textImage', document_id: 1, w: 1, h: 1},
      {_: 'textButton', text: plain('Open'), type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'}}
    ))];
    expect(copy(blocks, [0, 0], [0, 8])).toEqual([paragraph(concat(plain('see '), plain('Open')))]);
  });

  it('keeps an empty paragraph between the texts taken, none before or after them', () => {
    const empty = paragraph({_: 'textEmpty'});
    const blocks = [empty, paragraph(plain('before')), empty, paragraph(plain('after')), empty];
    expect(copy(blocks, [0, 0], [1, 5])).toEqual([paragraph(plain('before')), empty, paragraph(plain('after'))]);
  });

  it('numbers the items taken as the list shows them, an item\'s own number counted on from', () => {
    const item = (text: string, value?: number) => ({
      _: 'pageListOrderedItemText' as const,
      pFlags: {},
      text: plain(text),
      ...(value !== undefined && {value})
    });
    const list = (...items: ReturnType<typeof item>[]): PageBlock => ({_: 'pageBlockOrderedList', pFlags: {}, items});
    // * the first item drawn as 10., the second as 11.
    expect(copy([list(item('one', 10), item('two'), item('three'))], [1, 0], [2, 5])).toEqual([
      {...list(item('two'), item('three')), start: 11}
    ]);

    // * an item that reads nothing, left out, leaves the one after it its number
    const picture: RichText = {_: 'textImage', document_id: 1, w: 1, h: 1};
    const withPicture: PageBlock = {_: 'pageBlockOrderedList', pFlags: {}, items: [
      item('one'),
      {_: 'pageListOrderedItemText', pFlags: {}, text: picture},
      item('three')
    ]};
    const sliced = copy([withPicture], [0, 0], [1, 5]);
    expect(sliced).toEqual([{...list(item('one'), item('three', 3)), start: 1}]);
    // * and its flat text too
    expect(richMessageToPlainMessage({_: 'richMessage', pFlags: {}, blocks: sliced, photos: [], documents: []}).text)
    .toBe('1. one\n3. three');
  });

  it('makes a quote\'s author, or a details block\'s title, taken alone a paragraph: neither is sent without the rest', () => {
    const blocks: PageBlock[] = [
      {_: 'pageBlockBlockquote', pFlags: {}, text: plain('said'), caption: plain('someone')},
      {_: 'pageBlockDetails', pFlags: {}, title: plain('More'), blocks: [paragraph(plain('hidden'))]}
    ];
    expect(copy(blocks, [1, 0], [1, 7])).toEqual([paragraph(plain('someone'))]);
    expect(copy(blocks, [2, 0], [2, 4])).toEqual([paragraph(plain('More'))]);
  });

  it('makes an author or a title taken with no more than spaces of the rest a paragraph, as the field sends it', () => {
    const blocks: PageBlock[] = [
      {_: 'pageBlockBlockquote', pFlags: {}, text: plain('said  '), caption: plain('someone')},
      {_: 'pageBlockDetails', pFlags: {}, title: plain('More'), blocks: [paragraph(plain('  hidden'))]}
    ];
    // * from the spaces after "said" to the end of the author
    expect(copy(blocks, [0, 4], [1, 7])).toEqual([paragraph(plain('someone'))]);
    // * from the title to the spaces before "hidden"
    expect(copy(blocks, [2, 0], [3, 2])).toEqual([paragraph(plain('More'))]);
  });

  it('makes the author of a quote whose blocks read nothing a paragraph, as the field sends no such quote', () => {
    const blocks: PageBlock[] = [{_: 'pageBlockBlockquoteBlocks', caption: plain('Author'), blocks: [
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 1, caption: caption('', '')},
      paragraph({_: 'textEmpty'}),
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: 2, caption: caption('', '')}
    ]}];
    expect(mapRichQuoteTexts(blocks, normalizeRichQuoteFragment, {copy: true})).toEqual([paragraph(plain('Author'))]);
  });

  it('copies a list\'s markers that are numbers, a bot\'s markdown list, as the numbers its items have', () => {
    const item = (text: string, num?: string) => ({
      _: 'pageListOrderedItemText' as const,
      pFlags: {},
      ...(num !== undefined && {num}),
      text: plain(text)
    });
    const counted = (text: string, value?: number) => ({
      _: 'pageListOrderedItemText' as const,
      pFlags: {},
      text: plain(text),
      ...(value !== undefined && {value})
    });
    const list = (items: object[], start?: number): PageBlock => ({
      _: 'pageBlockOrderedList',
      pFlags: {},
      items: items as PageListOrderedItem[],
      ...(start !== undefined && {start})
    });
    const markdown = [list([item('seven', '7'), item('eight', '8')])];
    expect(copy(markdown, [0, 0], [1, 5])).toEqual([list([counted('seven'), counted('eight')], 7)]);
    expect(copy(markdown, [1, 0], [1, 5])).toEqual([list([counted('eight')], 8)]);

    // * a marker is a label: an item without one is drawn with the number the list counts for it, "7." then "2."
    const labelled = [list([item('seven', '7'), item('two')])];
    expect(copy(labelled, [0, 0], [1, 3])).toEqual([list([counted('seven'), counted('two', 2)], 7)]);
    expect(copy(labelled, [1, 0], [1, 3])).toEqual([list([counted('two')], 2)]);

    // * a marker that is no number stays a marker
    const roman = [list([item('four', 'iv'), item('five', 'v')])];
    expect(copy(roman, [0, 0], [1, 4])).toEqual(roman);

    // * a marker is drawn as it is written whatever the list's type: in figures
    const romanType = {...list([item('eight', '8'), item('nine', '9')]), type: 'i'} as PageBlock;
    expect(copy([romanType], [0, 0], [1, 4])).toEqual([{
      ...list([{...counted('eight'), type: '1'}, {...counted('nine'), type: '1'}], 8),
      type: 'i'
    }]);
  });

  it('walks nested blocks once, deep as they go', () => {
    let blocks: PageBlock[] = [paragraph(plain('leaf'))];
    for(let depth = 0; depth < 24; ++depth) {
      blocks = [{_: 'pageBlockDetails', pFlags: {}, title: plain(''), blocks}];
    }

    let leaf = 0;
    mapRichQuoteTexts(blocks, (text) => {
      if(getRichTextFlatTextOf(text) === 'leaf') ++leaf;
      return text;
    }, {copy: true});
    expect(leaf).toBe(1);
  });

  it('copies a bot\'s thinking as a paragraph of its text', () => {
    const blocks: PageBlock[] = [{_: 'pageBlockThinking', text: plain('Let me think')}];
    expect(copy(blocks, [0, 0], [0, 6])).toEqual([paragraph(plain('Let me'))]);
  });

  it('takes a file\'s caption and a row of buttons\' labels between the texts taken, which no quote counts', () => {
    const button = (text: string) => ({_: 'pageButton' as const, text: plain(text), type: {_: 'inlineButtonTypeUrl' as const, url: 'https://telegram.org'}});
    const blocks: PageBlock[] = [
      paragraph(plain('before')),
      {_: 'pageBlockDocument', document_id: 1, caption: caption('a file', '')},
      {_: 'pageBlockButtonRow', pFlags: {}, buttons: [button('One'), button('Two')]},
      paragraph(plain('after'))
    ];
    expect(getRichQuoteNodes(blocks).map((node) => node.flat)).toEqual(['before', 'after']);
    expect(copy(blocks, [0, 0], [1, 5])).toEqual([
      paragraph(plain('before')),
      paragraph(plain('a file')),
      paragraph(plain('One Two')),
      paragraph(plain('after'))
    ]);
    expect(copy(blocks, [1, 0], [1, 5])).toEqual([paragraph(plain('after'))]);
  });
});
