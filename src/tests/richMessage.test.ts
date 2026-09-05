import {PageBlock, RichMessage, RichText} from '@layer';
import {flattenRichMessageContent, flattenRichMessageSummary, richMessageToPage} from '@lib/richMessage';

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
