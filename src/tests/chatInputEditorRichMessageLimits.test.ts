import type {InputGeoPoint, PageBlock, PageCaption, RichText} from '@layer';
import {
  DEFAULT_RICH_MESSAGE_LIMITS,
  measureRichMessage,
  resolveRichMessageLimits,
  RichMessageLimits,
  validateRichMessage
} from '@appManagers/utils/richMessage/validateRichMessage';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

const emptyText: RichText = {_: 'textEmpty'};
const text = (value: string): RichText => ({_: 'textPlain', text: value});
const paragraph = (value = ''): PageBlock => ({_: 'pageBlockParagraph', text: text(value)});
const richParagraph = (value: RichText): PageBlock => ({_: 'pageBlockParagraph', text: value});
const caption = (value = ''): PageCaption => ({
  _: 'pageCaption',
  text: text(value),
  credit: emptyText
});
const limits = (overrides: Partial<RichMessageLimits> = {}): RichMessageLimits => ({
  ...DEFAULT_RICH_MESSAGE_LIMITS,
  ...overrides
});

function nestedDetails(depth: number, value: RichText = text('deep')): PageBlock {
  let block = richParagraph(value);
  for(let currentDepth = 0; currentDepth < depth; ++currentDepth) {
    block = {
      _: 'pageBlockDetails',
      pFlags: {},
      title: emptyText,
      blocks: [block]
    };
  }
  return block;
}

function nestedRichText(depth: number): RichText {
  let value = text('deep');
  for(let currentDepth = 0; currentDepth < depth; ++currentDepth) {
    value = {_: 'textBold', text: value};
  }
  return value;
}

function nestedConcat(depth: number): RichText {
  let value = text('deep');
  for(let currentDepth = 0; currentDepth < depth; ++currentDepth) {
    value = {_: 'textConcat', texts: [value]};
  }
  return value;
}

function photo(index: number): PageBlock {
  return {
    _: 'pageBlockPhoto',
    pFlags: {},
    photo_id: index,
    caption: caption()
  };
}

function tableCell(
  options: Partial<{
    pFlags: PageBlock.pageBlockTable['rows'][number]['cells'][number]['pFlags'],
    text: RichText,
    colspan: number,
    rowspan: number
  }> = {}
): PageBlock.pageBlockTable['rows'][number]['cells'][number] {
  return {
    _: 'pageTableCell',
    pFlags: options.pFlags || {},
    text: options.text ?? emptyText,
    colspan: options.colspan,
    rowspan: options.rowspan
  };
}

function richTable(rows: PageBlock.pageBlockTable['rows']): PageBlock.pageBlockTable {
  return {
    _: 'pageBlockTable',
    pFlags: {},
    title: emptyText,
    rows
  };
}

function table(columns: number, rowspan = 1): PageBlock {
  return richTable([{
    _: 'pageTableRow',
    cells: [tableCell({colspan: columns, rowspan})]
  }]);
}

describe('rich-message limits', () => {
  test('resolves server config values over the official defaults', () => {
    expect(resolveRichMessageLimits()).toEqual(DEFAULT_RICH_MESSAGE_LIMITS);
    expect(resolveRichMessageLimits({
      rich_message_length_limit: 1000,
      rich_message_max_blocks: 40,
      rich_message_max_depth: 8,
      rich_message_max_media: 12,
      rich_message_max_table_cols: 7
    })).toEqual({
      lengthLimit: 1000,
      maxBlocks: 40,
      maxDepth: 8,
      maxMedia: 12,
      maxTableColumns: 7,
      serializedSizeLimit: 256 * 1024
    });
  });

  test('counts text in UTF-16 code units', () => {
    const atLimit = validateRichMessage([paragraph('😀'.repeat(16384))]);
    expect(atLimit.valid).toBe(true);
    expect(atLimit.metrics.textLength).toBe(32768);

    const overLimit = validateRichMessage([paragraph(`${'a'.repeat(32767)}😀`)]);
    expect(overLimit.valid).toBe(false);
    expect(overLimit.error).toBe('length');
    expect(overLimit.metrics.textLength).toBe(32769);
  });

  test('counts inline and block math source text at the length boundary', () => {
    const inlineAtLimit = validateRichMessage([richParagraph({
      _: 'textMath',
      source: 'x'.repeat(32768)
    })]);
    expect(inlineAtLimit).toMatchObject({
      valid: true,
      metrics: {textLength: 32768}
    });
    expect(validateRichMessage([richParagraph({
      _: 'textMath',
      source: 'x'.repeat(32769)
    })])).toMatchObject({
      error: 'length',
      metrics: {textLength: 32769}
    });

    const blockAtLimit = validateRichMessage([{
      _: 'pageBlockMath',
      source: 'x'.repeat(32768)
    }]);
    expect(blockAtLimit).toMatchObject({
      valid: true,
      metrics: {textLength: 32768}
    });
    expect(validateRichMessage([{
      _: 'pageBlockMath',
      source: `${'x'.repeat(32767)}😀`
    }])).toMatchObject({
      error: 'length',
      metrics: {textLength: 32769}
    });
  });

  test('counts top-level blocks, list items, nested blocks, and table rows', () => {
    const metrics = measureRichMessage([
      {
        _: 'pageBlockList',
        items: [
          {_: 'pageListItemText', pFlags: {}, text: text('one')},
          {_: 'pageListItemText', pFlags: {}, text: text('two')}
        ]
      },
      {
        _: 'pageBlockDetails',
        pFlags: {},
        title: text('details'),
        blocks: [paragraph('inside')]
      },
      {
        _: 'pageBlockTable',
        pFlags: {},
        title: emptyText,
        rows: [
          {_: 'pageTableRow', cells: []},
          {_: 'pageTableRow', cells: []}
        ]
      }
    ]);

    expect(metrics.blockCount).toBe(8);
    expect(metrics.maxDepth).toBe(1);
  });

  test('enforces block and zero-based PageBlock/RichText depth boundaries', () => {
    expect(validateRichMessage(Array.from({length: 500}, () => paragraph('x'))).valid).toBe(true);
    expect(validateRichMessage(Array.from({length: 501}, () => paragraph('x'))).error).toBe('blocks');
    expect(measureRichMessage([paragraph('top-level')]).maxDepth).toBe(0);
    expect(validateRichMessage([nestedDetails(16)]).valid).toBe(true);
    expect(validateRichMessage([nestedDetails(17)]).error).toBe('depth');
    expect(validateRichMessage([richParagraph(nestedRichText(16))]).valid).toBe(true);
    expect(validateRichMessage([richParagraph(nestedRichText(17))]).error).toBe('depth');
    expect(validateRichMessage([richParagraph(nestedConcat(16))])).toMatchObject({
      valid: true,
      metrics: {maxDepth: 16}
    });
    expect(validateRichMessage([richParagraph(nestedConcat(17))])).toMatchObject({
      error: 'depth',
      metrics: {maxDepth: 17}
    });
    expect(validateRichMessage([nestedDetails(8, nestedRichText(8))])).toMatchObject({
      valid: true,
      metrics: {maxDepth: 16}
    });
    expect(validateRichMessage([nestedDetails(8, nestedRichText(9))])).toMatchObject({
      error: 'depth',
      metrics: {maxDepth: 17}
    });
  });

  test('enforces the media limit', () => {
    expect(validateRichMessage(Array.from({length: 50}, (_, index) => photo(index))).valid).toBe(true);
    const result = validateRichMessage(Array.from({length: 51}, (_, index) => photo(index)));
    expect(result.error).toBe('media');
    expect(result.metrics.mediaCount).toBe(51);
  });

  test('rejects oversized collages without imposing the album limit on slideshows', () => {
    const items = Array.from({length: MESSAGES_ALBUM_MAX_SIZE + 1}, (_, index) => (
      photo(index) as PageBlock.pageBlockPhoto
    ));
    expect(validateRichMessage([{
      _: 'pageBlockCollage',
      items,
      caption: caption()
    }])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{
      _: 'pageBlockSlideshow',
      items,
      caption: caption()
    }])).toMatchObject({valid: true});
  });

  test('measures effective table columns with colspan and rowspan occupancy', () => {
    expect(validateRichMessage([table(20)]).valid).toBe(true);
    expect(validateRichMessage([table(21)]).error).toBe('tableColumns');

    const occupiedRows: PageBlock = {
      _: 'pageBlockTable',
      pFlags: {},
      title: emptyText,
      rows: [
        {
          _: 'pageTableRow',
          cells: [{
            _: 'pageTableCell',
            pFlags: {},
            text: emptyText,
            colspan: 20,
            rowspan: 2
          }]
        },
        {
          _: 'pageTableRow',
          cells: [{_: 'pageTableCell', pFlags: {}, text: emptyText}]
        }
      ]
    };
    const result = validateRichMessage([occupiedRows]);
    expect(result.error).toBe('tableColumns');
    expect(result.metrics.maxTableColumns).toBe(21);
  });

  test('rejects invalid and conflicting table spans', () => {
    for(const colspan of [0, -1, 1.5, 0x80000000]) {
      expect(validateRichMessage([table(colspan)]).error).toBe('invalid');
    }

    const conflict = richTable([
      {
        _: 'pageTableRow',
        cells: [tableCell(), tableCell({rowspan: 2})]
      },
      {
        _: 'pageTableRow',
        cells: [tableCell({colspan: 2})]
      }
    ]);
    const conflictResult = validateRichMessage([conflict]);
    expect(conflictResult.error).toBe('invalid');
    expect(conflictResult.metrics.tableConflict).toBe(true);

    const valid = richTable([
      {
        _: 'pageTableRow',
        cells: [tableCell({rowspan: 2}), tableCell()]
      },
      {
        _: 'pageTableRow',
        cells: [tableCell()]
      }
    ]);
    expect(validateRichMessage([valid]).valid).toBe(true);
    expect(validateRichMessage([richTable([{
      _: 'pageTableRow',
      cells: [tableCell({pFlags: {align_center: true, align_right: true}})]
    }])]).error).toBe('invalid');
  });

  test('validates input map coordinates, dimensions, zoom, and accuracy', () => {
    const geo: InputGeoPoint.inputGeoPoint = {
      _: 'inputGeoPoint',
      lat: 51.5074,
      long: -0.1278,
      accuracy_radius: 12
    };
    const map: PageBlock.inputPageBlockMap = {
      _: 'inputPageBlockMap',
      geo,
      zoom: 15,
      w: 400,
      h: 200,
      caption: caption()
    };
    expect(validateRichMessage([map])).toMatchObject({valid: true});
    expect(validateRichMessage([{
      ...map,
      geo: {_: 'inputGeoPointEmpty'}
    }])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{
      ...map,
      geo: {...geo, lat: 91}
    }])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{
      ...map,
      geo: {...geo, long: -181}
    }])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{
      ...map,
      geo: {...geo, accuracy_radius: -1}
    }])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{...map, zoom: 0}])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{...map, w: 0}])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([{...map, h: 1.5}])).toMatchObject({error: 'invalid'});
  });

  test('validates custom-emoji fallback as exactly one emoji', () => {
    const customEmoji = (alt: string, documentId: string | number = 1): RichText => ({
      _: 'textCustomEmoji',
      document_id: documentId,
      alt
    });

    for(const alt of ['', '😀', '👨‍👩‍👧‍👦', '🇺🇦', '1️⃣']) {
      expect(validateRichMessage([richParagraph(customEmoji(alt))]).valid).toBe(true);
    }
    for(const alt of ['a', '1', '😀😀', '😀 text']) {
      expect(validateRichMessage([richParagraph(customEmoji(alt))]).error).toBe('invalid');
    }
    expect(validateRichMessage([richParagraph(customEmoji('😀', 0))]).error).toBe('invalid');
  });

  test('validates formatted-date ranges, flag combinations, and label limits', () => {
    const formattedDate = (
      label: string,
      pFlags: RichText.textDate['pFlags'] = {},
      date = Math.floor(Date.now() / 1000)
    ): RichText => ({
      _: 'textDate',
      pFlags,
      text: text(label),
      date
    });

    expect(validateRichMessage([richParagraph(formattedDate('x'.repeat(128)))])).toMatchObject({valid: true});
    expect(validateRichMessage([richParagraph(formattedDate('x'.repeat(129)))])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph(formattedDate(
      'x'.repeat(32),
      {relative: true, long_time: true, day_of_week: true}
    ))])).toMatchObject({valid: true});
    expect(validateRichMessage([richParagraph(formattedDate(
      'x'.repeat(33),
      {short_time: true}
    ))])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph(formattedDate(
      'date',
      {short_time: true, long_time: true}
    ))])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph(formattedDate(
      'date',
      {short_date: true, long_date: true}
    ))])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph(formattedDate('date', {}, -1))])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph(formattedDate(
      'date',
      {},
      Math.floor(Date.now() / 1000) + 3 * 366 * 86400 + 10
    ))])).toMatchObject({error: 'invalid'});
  });

  test('allows empty text list items but still requires list and block-item vectors', () => {
    const list: PageBlock = {
      _: 'pageBlockList',
      items: [{_: 'pageListItemText', pFlags: {}, text: emptyText}]
    };
    const orderedList: PageBlock = {
      _: 'pageBlockOrderedList',
      pFlags: {},
      items: [{_: 'pageListOrderedItemText', pFlags: {}, text: emptyText}]
    };
    expect(validateRichMessage([list])).toMatchObject({valid: true});
    expect(validateRichMessage([orderedList])).toMatchObject({valid: true});
    expect(measureRichMessage([list])).toMatchObject({blockCount: 2, textLength: 0});
    expect(validateRichMessage([{
      _: 'pageBlockList',
      items: []
    }])).toMatchObject({error: 'content'});
    expect(validateRichMessage([{
      _: 'pageBlockList',
      items: [{_: 'pageListItemBlocks', pFlags: {}, blocks: []}]
    }])).toMatchObject({error: 'content'});
  });

  test('allows thinking only while streaming and validates its content', () => {
    const thinking: PageBlock = {_: 'pageBlockThinking', text: text('working')};
    expect(validateRichMessage([thinking])).toMatchObject({error: 'unsupported'});
    expect(validateRichMessage([thinking], DEFAULT_RICH_MESSAGE_LIMITS, {streaming: true}))
      .toMatchObject({valid: true});
    expect(validateRichMessage(
      [{_: 'pageBlockThinking', text: emptyText}],
      DEFAULT_RICH_MESSAGE_LIMITS,
      {streaming: true}
    )).toMatchObject({error: 'content'});
  });

  test('treats attribute-backed inline nodes as content and preserves validation errors', () => {
    expect(validateRichMessage([richParagraph({
      _: 'textAnchor',
      name: 'reference',
      text: emptyText
    })])).toMatchObject({valid: true});
    expect(validateRichMessage([richParagraph({
      _: 'textAnchor',
      name: '',
      text: emptyText
    })])).toMatchObject({error: 'invalid'});
    expect(validateRichMessage([richParagraph({
      _: 'textImage',
      document_id: 1,
      w: 1,
      h: 1
    })])).toMatchObject({error: 'unsupported'});
    expect(validateRichMessage([richParagraph({
      _: 'textMention',
      text: text('@name')
    })])).toMatchObject({error: 'invalid'});
  });

  test('requires non-draft block content without rejecting draft placeholders', () => {
    const emptyParagraph = richParagraph(emptyText);
    const emptyDetails: PageBlock = {
      _: 'pageBlockDetails',
      pFlags: {},
      title: emptyText,
      blocks: []
    };
    expect(validateRichMessage([emptyParagraph])).toMatchObject({error: 'content'});
    expect(validateRichMessage([emptyDetails])).toMatchObject({error: 'content'});
    expect(validateRichMessage(
      [emptyParagraph, emptyDetails],
      DEFAULT_RICH_MESSAGE_LIMITS,
      {draft: true}
    )).toMatchObject({valid: true});
  });

  test('allows internal empty paragraphs but rejects empty paragraph edges', () => {
    const content = richParagraph(text('content'));
    const empty = richParagraph(emptyText);

    expect(validateRichMessage([content, empty, content])).toMatchObject({valid: true});
    expect(validateRichMessage([empty, content])).toMatchObject({error: 'content'});
    expect(validateRichMessage([content, empty])).toMatchObject({error: 'content'});
  });

  test('rejects whitespace-only required content', () => {
    expect(validateRichMessage([richParagraph(text('   '))])).toMatchObject({error: 'content'});
    expect(validateRichMessage([{
      _: 'pageBlockHeading2',
      text: text('\n\t ')
    }])).toMatchObject({error: 'content'});
    expect(validateRichMessage([{
      _: 'pageBlockMath',
      source: '   '
    }])).toMatchObject({error: 'content'});
  });

  test('accepts relative URLs and preserves nested validation categories', () => {
    expect(validateRichMessage([richParagraph({
      _: 'textUrl',
      text: text('docs'),
      url: 'docs/page',
      webpage_id: 0
    })])).toMatchObject({valid: true});
    expect(validateRichMessage([richParagraph({
      _: 'textUrl',
      text: text('bad'),
      url: 'javascript:alert(1)',
      webpage_id: 0
    })])).toMatchObject({error: 'invalid'});

    const invalidCaptionPhoto = photo(1) as PageBlock.pageBlockPhoto;
    invalidCaptionPhoto.caption.text = {
      _: 'textImage',
      document_id: 1,
      w: 1,
      h: 1
    };
    expect(validateRichMessage([invalidCaptionPhoto])).toMatchObject({error: 'unsupported'});
  });

  test('measures and enforces the serialized block-vector size', () => {
    const blocks = [paragraph('serialized')];
    const serializedSize = measureRichMessage(blocks).serializedSize;
    expect(serializedSize).toBeGreaterThan(0);
    expect(validateRichMessage(
      blocks,
      limits({serializedSizeLimit: serializedSize})
    )).toMatchObject({valid: true});
    expect(validateRichMessage(
      blocks,
      limits({serializedSizeLimit: serializedSize - 1})
    )).toMatchObject({error: 'size'});

    const oversized = validateRichMessage([richParagraph({
      _: 'textUrl',
      text: text('x'),
      url: `https://example.com/${'x'.repeat(256 * 1024)}`,
      webpage_id: 0
    })]);
    expect(oversized.metrics.serializedSize).toBeGreaterThan(256 * 1024);
    expect(oversized.error).toBe('size');
  });

  test('accepts exactly 256 KiB of serialized blocks and rejects the next TL word', () => {
    // Vector<PageBlock> + pageBlockParagraph + textPlain take 20 bytes before
    // the long-string payload. TL strings are padded to four-byte words.
    const textAtLimit = 'x'.repeat(DEFAULT_RICH_MESSAGE_LIMITS.serializedSizeLimit - 20);
    const validationLimits = limits({lengthLimit: Number.MAX_SAFE_INTEGER});
    const atLimit = validateRichMessage([paragraph(textAtLimit)], validationLimits);
    expect(atLimit).toMatchObject({
      valid: true,
      metrics: {serializedSize: 256 * 1024}
    });

    const overLimit = validateRichMessage([paragraph(`${textAtLimit}x`)], validationLimits);
    expect(overLimit).toMatchObject({
      error: 'size',
      metrics: {serializedSize: 256 * 1024 + 4}
    });
  });

  test('reports the first official-priority limit violation', () => {
    const result = validateRichMessage(
      [paragraph('too long'), paragraph('also a second block')],
      limits({lengthLimit: 1, maxBlocks: 1})
    );
    expect(result.error).toBe('length');
  });
});


test.each(['decimal', 'lower-alpha', 'lower-latin', 'upper-alpha', 'upper-latin', 'lower-roman', 'upper-roman', 'UPPER-ROMAN'])('accepts supported outgoing list type %s', (type) => {
  const block: PageBlock = {_: 'pageBlockOrderedList', pFlags: {}, type, items: [
    {_: 'pageListOrderedItemText', pFlags: {}, type, text: text('Item')}
  ]};
  expect(validateRichMessage([block]).valid).toBe(true);
});
