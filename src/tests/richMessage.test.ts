import {PageBlock, PageCaption, RichMessage, RichText} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import {flattenRichMessageContent, flattenRichMessageSummary, isRichMessageFullWidth, richMessageToPage, richMessageToPlainMessage} from '@lib/richMessage';
import {entitiesFittingPlainMessage} from '@components/chat/inputEditor/model';

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

  test('survives a revision that carries no flags at all', () => {
    // Streamed drafts render every revision the sender pushes, so this runs on partial data;
    // a throw here happens inside renderMessage and costs the whole bubble.
    const rich = {_: 'richMessage', blocks: []} as unknown as RichMessage;

    const page = richMessageToPage(rich);

    expect(page.pFlags.rtl).toBeUndefined();
    expect(page.pFlags.part).toBeUndefined();
    expect(page.blocks).toEqual([]);
    expect(page.photos).toEqual([]);
    expect(page.documents).toEqual([]);
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
      {_: 'pageBlockBlockquote', pFlags: {}, text: text('quote'), caption: text('author')},
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

  test('content-only flattening keeps real captions and excludes synthetic media and unsupported labels', () => {
    const rich = richMessage([
      {
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: 1,
        caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
      },
      {
        _: 'pageBlockVideo',
        pFlags: {},
        video_id: 2,
        caption: {_: 'pageCaption', text: text('real caption'), credit: {_: 'textEmpty'}}
      },
      {_: 'pageBlockUnsupported'}
    ]);

    expect(flattenRichMessageSummary(rich).text).toBe('Photo\nreal caption\nUnsupported block');
    expect(flattenRichMessageContent(rich).text).toBe('real caption');
  });

  test('content-only flattening keeps caption credits and nested media text without expanding summaries', () => {
    const rich = richMessage([{
      _: 'pageBlockSlideshow',
      caption: {
        _: 'pageCaption',
        text: text('outer caption'),
        credit: text('outer credit')
      },
      items: [{
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: 1,
        caption: {
          _: 'pageCaption',
          text: text('nested caption'),
          credit: text('nested credit')
        }
      }]
    }]);

    expect(flattenRichMessageSummary(rich).text).toBe('outer caption');
    expect(flattenRichMessageContent(rich).text).toBe(
      'outer caption\nouter credit\nnested caption\nnested credit'
    );
  });

  test('content-only flattening includes embed blocks and author-date text', () => {
    const rich = richMessage([{
      _: 'pageBlockEmbedPost',
      url: '',
      webpage_id: 1,
      author_photo_id: 0,
      author: 'Post author',
      date: 1_000,
      caption: {
        _: 'pageCaption',
        text: text('embed caption'),
        credit: text('embed credit')
      },
      blocks: [{_: 'pageBlockParagraph', text: text('embedded body')}]
    }, {
      _: 'pageBlockAuthorDate',
      author: text('Article author'),
      published_date: 1_000
    }]);

    expect(flattenRichMessageSummary(rich).text).toBe(
      'embed caption\nArticle author'
    );
    expect(flattenRichMessageContent(rich).text).toBe(
      'embed caption\nembed credit\nPost author\nembedded body\nArticle author'
    );
  });

  test('content-only flattening includes every visible metadata label', () => {
    const rich = richMessage([{
      _: 'pageBlockChannel',
      channel: {_: 'channel', id: 1, pFlags: {}, title: 'Visible channel'} as any
    }, {
      _: 'pageBlockRelatedArticles',
      title: text('Related'),
      articles: [{
        _: 'pageRelatedArticle',
        url: 'https://example.com',
        webpage_id: 1,
        title: 'Article title',
        description: 'Article description',
        author: 'Article author',
        published_date: 0
      }]
    }, {
      _: 'inputPageBlockMap',
      geo: {_: 'inputGeoPointEmpty'},
      zoom: 1,
      w: 1,
      h: 1,
      caption: {
        _: 'pageCaption',
        text: text('Map caption'),
        credit: text('Map credit')
      }
    }]);

    expect(flattenRichMessageContent(rich).text).toBe(
      'Visible channel\nRelated\nArticle title\nArticle description\nArticle author\nMap caption\nMap credit'
    );
  });

  test('keeps RTL as a page flag and tolerates unknown future blocks', () => {
    const rich = richMessage([
      {_: 'pageBlockFuture', value: 1} as any
    ], {rtl: true});

    expect(richMessageToPage(rich).pFlags.rtl).toBe(true);
    expect(flattenRichMessageSummary(rich).text).toBe('Unsupported block: pageBlockFuture');
  });

  test('renders the updated side of layer 228 text diffs', () => {
    const summary = flattenRichMessageSummary(richMessage([
      {
        _: 'pageBlockParagraph',
        text: {
          _: 'textDiff',
          text: text('new'),
          old_text: text('old')
        }
      }
    ]));

    expect(summary.text).toBe('new');
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

  test('resizes entities that span decoded inline math', () => {
    const summary = flattenRichMessageSummary(richMessage([{
      _: 'pageBlockParagraph',
      text: {
        _: 'textBold',
        text: {
          _: 'textConcat',
          texts: [
            text('before '),
            {_: 'textMath', source: 'x'} as RichText,
            text(' after')
          ]
        }
      }
    }]));

    expect(summary.text).toBe('before x after');
    expect(summary.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: 0,
      length: summary.text.length
    });
  });
});

describe('layer 229 rich text', () => {
  test('shows the label of a page button until pages can draw real buttons', () => {
    const button: RichText = {
      _: 'textButton',
      text: {_: 'textConcat', texts: [text('Open '), {_: 'textBold', text: text('now')}]},
      type: {_: 'inlineButtonTypeUrl', url: 'https://example.com/'}
    } as RichText;

    const wrapped = wrapTelegramRichText(button);
    expect(wrapped.text).toBe('Open now');
    // the inner formatting survives; only the button chrome is dropped
    expect(wrapped.entities.some((entity) => entity._ === 'messageEntityBold')).toBe(true);
  });
});

describe('isRichMessageFullWidth', () => {
  const paragraph: PageBlock = {_: 'pageBlockParagraph', text: text('a line')};
  const table = {_: 'pageBlockTable', pFlags: {}, title: {_: 'textEmpty'}, rows: []} as PageBlock;
  const buttonRow = {_: 'pageBlockButtonRow', pFlags: {}, buttons: []} as PageBlock;

  test('text takes the width of its lines', () => {
    expect(isRichMessageFullWidth([
      paragraph,
      {_: 'pageBlockHeading1', text: text('Heading')},
      {_: 'pageBlockBlockquote', pFlags: {}, text: text('quote'), caption: {_: 'textEmpty'}},
      {_: 'pageBlockPreformatted', text: text('code'), language: ''},
      {_: 'pageBlockMath', source: 'x'},
      {_: 'pageBlockDivider'}
    ])).toBe(false);
  });

  test('a table, a row of buttons, details, a pullquote and media take the whole width', () => {
    const blocks = [
      table,
      buttonRow,
      {_: 'pageBlockDetails', pFlags: {}, blocks: [paragraph], title: text('More')},
      {_: 'pageBlockPullquote', text: text('pull'), caption: {_: 'textEmpty'}},
      {_: 'pageBlockPhoto', photo_id: '1', caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}}
    ] as PageBlock[];
    blocks.forEach((block) => expect(isRichMessageFullWidth([paragraph, block])).toBe(true));
  });

  test('a quote or a list is as wide as what is inside it', () => {
    expect(isRichMessageFullWidth([{_: 'pageBlockBlockquoteBlocks', blocks: [paragraph], caption: {_: 'textEmpty'}}])).toBe(false);
    expect(isRichMessageFullWidth([{_: 'pageBlockBlockquoteBlocks', blocks: [table], caption: {_: 'textEmpty'}}])).toBe(true);
    expect(isRichMessageFullWidth([{_: 'pageBlockList', items: [{_: 'pageListItemText', pFlags: {}, text: text('item')}]} as PageBlock])).toBe(false);
    expect(isRichMessageFullWidth([{_: 'pageBlockList', items: [{_: 'pageListItemBlocks', pFlags: {}, blocks: [buttonRow]}]} as PageBlock])).toBe(true);
    expect(isRichMessageFullWidth([{_: 'pageBlockOrderedList', pFlags: {}, items: [{_: 'pageListOrderedItemBlocks', pFlags: {}, num: '1', blocks: [table]}]} as PageBlock])).toBe(true);
  });
});

// Android's RichMessageConvert is the reference: what a plain message carries stays, a heading turns
// bold, a formula code, lists and tables are written out, a picture leaves its caption
describe('richMessageToPlainMessage', () => {
  const caption = (value: string, credit = ''): PageCaption => ({_: 'pageCaption', text: text(value), credit: text(credit)});

  test('keeps the formatting a plain message carries', () => {
    const plain = richMessageToPlainMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textConcat', texts: [
        {_: 'textBold', text: text('Bold')},
        text(' '),
        {_: 'textUrl', text: text('link'), url: 'https://telegram.org', webpage_id: '0'}
      ]}
    }]));

    expect(plain.text).toBe('Bold link');
    expect(plain.entities).toEqual([
      {_: 'messageEntityBold', offset: 0, length: 4},
      expect.objectContaining({_: 'messageEntityTextUrl', offset: 5, length: 4, url: 'https://telegram.org'})
    ]);
  });

  test('turns headings bold, formulas into code and a divider into a line', () => {
    const plain = richMessageToPlainMessage(richMessage([
      {_: 'pageBlockHeading2', text: text('Title')},
      {_: 'pageBlockMath', source: 'x^2'},
      {_: 'pageBlockDivider'},
      {_: 'pageBlockPreformatted', text: text('let a;'), language: 'js'}
    ]));

    expect(plain.text).toBe('Title\nx^2\n——————————\nlet a;');
    expect(plain.entities).toEqual([
      {_: 'messageEntityBold', offset: 0, length: 5},
      {_: 'messageEntityCode', offset: 6, length: 3},
      {_: 'messageEntityPre', offset: 21, length: 6, language: 'js'}
    ]);
  });

  // a document holds one bold over a letter: a second one would make the field refuse the text
  test('keeps one bold over a heading that is bold in part already', () => {
    const plain = richMessageToPlainMessage(richMessage([{
      _: 'pageBlockHeading1',
      text: {_: 'textConcat', texts: [{_: 'textBold', text: text('Big')}, text(' news')]}
    }]));

    expect(plain.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 8}]);
  });

  test('writes lists out with the markers a pasted list gets', () => {
    const plain = richMessageToPlainMessage(richMessage([
      {_: 'pageBlockList', items: [
        {_: 'pageListItemText', pFlags: {checkbox: true, checked: true}, text: text('done')},
        {_: 'pageListItemBlocks', pFlags: {}, blocks: [
          {_: 'pageBlockParagraph', text: text('outer')},
          {_: 'pageBlockOrderedList', pFlags: {}, items: [
            {_: 'pageListOrderedItemText', pFlags: {}, text: text('inner')}
          ]}
        ]}
      ]},
      {_: 'pageBlockOrderedList', pFlags: {}, start: 3, type: 'a', items: [
        {_: 'pageListOrderedItemText', pFlags: {}, text: text('third')}
      ]}
    ]));

    expect(plain.text).toBe('- [x] done\n- outer\n  1. inner\nc. third');
  });

  test('writes a table out row by row under its title', () => {
    const cell = (value: string) => ({_: 'pageTableCell' as const, pFlags: {}, text: text(value)});
    const plain = richMessageToPlainMessage(richMessage([{
      _: 'pageBlockTable',
      pFlags: {},
      title: text('Prices'),
      rows: [
        {_: 'pageTableRow', cells: [cell('Tea'), cell('2')]},
        {_: 'pageTableRow', cells: [cell('Coffee'), cell('3')]}
      ]
    }]));

    expect(plain.text).toBe('Prices\nTea  |  2\nCoffee  |  3');
  });

  test('quotes a quote with its author, and a quote inside it is not quoted twice', () => {
    const plain = richMessageToPlainMessage(richMessage([{
      _: 'pageBlockBlockquoteBlocks',
      caption: text('Author'),
      blocks: [
        {_: 'pageBlockParagraph', text: text('Words')},
        {_: 'pageBlockBlockquote', pFlags: {}, text: text('Inner'), caption: {_: 'textEmpty'}}
      ]
    }]));

    expect(plain.text).toBe('Words\nInner\n— Author');
    expect(plain.entities).toEqual([
      {_: 'messageEntityBlockquote', offset: 0, length: plain.text.length, pFlags: {}}
    ]);
  });

  test('leaves a picture its caption and drops one without', () => {
    const plain = richMessageToPlainMessage(richMessage([
      {_: 'pageBlockPhoto', pFlags: {}, photo_id: '1', caption: caption('Sunset', 'Photo: me')},
      {_: 'pageBlockVideo', pFlags: {}, video_id: '2', caption: caption('')},
      {_: 'pageBlockParagraph', text: text('After')}
    ]));

    expect(plain.text).toBe('Sunset\nPhoto: me\nAfter');
  });

  test('leaves out what only a rich message carries once fitted to a plain one', () => {
    const plain = richMessageToPlainMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textConcat', texts: [
        {_: 'textMarked', text: text('marked')},
        text(' '),
        {_: 'textSubscript', text: text('2')},
        text(' '),
        {_: 'textItalic', text: text('kept')}
      ]}
    }]));

    expect(entitiesFittingPlainMessage(plain.entities)).toEqual([
      {_: 'messageEntityItalic', offset: 9, length: 4}
    ]);
  });
});
