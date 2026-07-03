import {PageBlock, RichMessage, RichText} from '@layer';
import {flattenRichMessageSummary, richMessageToPage} from '@lib/richMessage';

const text = (value: string): RichText => ({_: 'textPlain', text: value});

function richMessage(blocks: PageBlock[], pFlags: RichMessage.richMessage['pFlags'] = {}): RichMessage {
  return {
    _: 'richMessage',
    pFlags,
    blocks,
    photos: [],
    documents: []
  };
}

describe('richMessageToPage', () => {
  test('creates an Instant View compatible page and preserves flags', () => {
    const rich = richMessage([
      {_: 'pageBlockHeading1', text: text('Heading')}
    ], {rtl: true, part: true});

    const page = richMessageToPage(rich);

    expect(page._).toBe('page');
    expect(page.blocks).toBe(rich.blocks);
    expect(page.photos).toBe(rich.photos);
    expect(page.documents).toBe(rich.documents);
    expect(page.pFlags.rtl).toBe(true);
    expect(page.pFlags.part).toBe(true);
    expect(page.views).toBe(0);
  });
});

describe('flattenRichMessageSummary', () => {
  test('flattens headings and paragraphs with entities', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {_: 'pageBlockHeading1', text: text('Title')},
      {
        _: 'pageBlockParagraph',
        text: {
          _: 'textConcat',
          texts: [
            text('Hello '),
            {_: 'textBold', text: text('bold')}
          ]
        }
      }
    ]));

    expect(summary.text).toBe('Title\nHello bold');
    expect(summary.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: 12,
      length: 4
    });
  });

  test('flattens unordered and ordered lists with prefixes', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockList',
        items: [{_: 'pageListItemText', pFlags: {}, text: text('first')}]
      },
      {
        _: 'pageBlockOrderedList',
        pFlags: {},
        items: [{_: 'pageListOrderedItemText', pFlags: {}, num: '2', text: text('second')}]
      }
    ]));

    expect(summary.text).toBe('- first\n2. second');
  });

  test('uses ordered list start and reversed flags when item numbers are absent', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockOrderedList',
        pFlags: {reversed: true},
        start: 4,
        items: [
          {_: 'pageListOrderedItemText', pFlags: {}, num: '', text: text('fourth')},
          {_: 'pageListOrderedItemText', pFlags: {}, num: '', text: text('third')}
        ]
      }
    ]));

    expect(summary.text).toBe('4. fourth\n3. third');
  });

  test('flattens quotes, details, tables and math', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {_: 'pageBlockBlockquote', text: text('quote'), caption: text('author')},
      {
        _: 'pageBlockDetails',
        pFlags: {},
        title: text('details'),
        blocks: [{_: 'pageBlockParagraph', text: text('inside')}]
      },
      {
        _: 'pageBlockTable',
        pFlags: {},
        title: text('table'),
        rows: [{
          _: 'pageTableRow',
          cells: [
            {_: 'pageTableCell', pFlags: {}, text: text('a')},
            {_: 'pageTableCell', pFlags: {}, text: text('b')}
          ]
        }]
      },
      {_: 'pageBlockMath', source: 'x^2'}
    ]));

    expect(summary.text).toBe('quote\nauthor\ndetails\ninside\ntable\na\tb\nx^2');
  });

  test('uses captions before media fallbacks', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: 1,
        caption: {_: 'pageCaption', text: text('caption'), credit: {_: 'textEmpty'}}
      },
      {
        _: 'pageBlockVideo',
        pFlags: {},
        video_id: 2,
        caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
      }
    ]));

    expect(summary.text).toBe('caption\nVideo');
  });

  test('keeps RTL as a page flag and tolerates unknown future blocks', () => {
    const rich = richMessage([
      {_: 'pageBlockFuture', value: 1} as any
    ], {rtl: true});

    expect(richMessageToPage(rich).pFlags.rtl).toBe(true);
    expect(flattenRichMessageSummary(rich).text).toBe('Unsupported block: pageBlockFuture');
  });

  test('decodes inline textMath to source and keeps following entities aligned', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockParagraph',
        text: {
          _: 'textConcat',
          texts: [
            text('E='),
            {_: 'textMath', source: 'mc^2'} as RichText,
            text(' is '),
            {_: 'textBold', text: text('famous')}
          ]
        }
      }
    ]));

    // The IV pipeline carries math as an opaque \x02<base64>\x02 marker; summaries must show the raw
    // source instead, and the bold entity after it must stay pinned to 'famous'.
    expect(summary.text).toBe('E=mc^2 is famous');
    expect(summary.text.includes('\x02')).toBe(false);
    expect(summary.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: 10,
      length: 6
    });
  });

  test('truncates without shifting entities when the text has leading whitespace', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockParagraph',
        text: {
          _: 'textConcat',
          texts: [
            text(' '.repeat(3)),
            {_: 'textBold', text: text('bold')},
            text('x'.repeat(200))
          ]
        }
      }
    ]), 100);

    // Leading spaces must NOT be trimmed (that would shift the bold entity); the bold stays at 3.
    expect(summary.text.startsWith('   bold')).toBe(true);
    expect(summary.text.length).toBe(103); // 100 chars + '...'
    expect(summary.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: 3,
      length: 4
    });
  });
});
