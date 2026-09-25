import canSafelyEditRichMessage from '@components/chat/inputEditor/richMessageEditability';
import type {PageBlock, RichMessage, RichText} from '@layer';

const empty: RichText = {_: 'textEmpty'};
const text = (value: string): RichText => ({_: 'textPlain', text: value});
const richMessage = (blocks: PageBlock[], pFlags: RichMessage.richMessage['pFlags'] = {}): RichMessage => ({
  _: 'richMessage',
  pFlags,
  blocks,
  photos: [],
  documents: []
});

describe('rich-message editability', () => {
  test('accepts the structural subset emitted by the chat editor', () => {
    expect(canSafelyEditRichMessage(richMessage([
      {_: 'pageBlockHeading2', text: {_: 'textBold', text: text('Heading')}},
      {
        _: 'pageBlockList',
        items: [
          {_: 'pageListItemText', pFlags: {checkbox: true, checked: true}, text: text('Done')},
          {_: 'pageListItemText', pFlags: {checkbox: true}, text: text('Todo')}
        ]
      },
      {
        _: 'pageBlockTable',
        pFlags: {bordered: true, striped: true},
        title: {_: 'textBold', text: text('Table')},
        rows: [{
          _: 'pageTableRow',
          cells: [{_: 'pageTableCell', pFlags: {header: true, align_center: true}, text: text('A')}]
        }]
      },
      {
        _: 'pageBlockDetails',
        pFlags: {},
        title: empty,
        blocks: [{_: 'pageBlockBlockquote', pFlags: {}, text: text('Hidden'), caption: empty}]
      },
      {_: 'pageBlockMath', source: 'x^2'}
    ]))).toBe(true);
  });

  test('rejects partial messages and accepts lossless opaque media and semantic blocks', () => {
    expect(canSafelyEditRichMessage(richMessage([], {part: true}))).toBe(false);
    expect(canSafelyEditRichMessage(richMessage([], {rtl: true}))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: 1,
      caption: {_: 'pageCaption', text: empty, credit: empty}
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{_: 'pageBlockDivider'}]))).toBe(true);
  });

  test('accepts mixed checkboxes and lossless ordered-list attributes', () => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockList',
      items: [
        {_: 'pageListItemText', pFlags: {checkbox: true, checked: true}, text: text('Task')},
        {_: 'pageListItemText', pFlags: {}, text: text('Bullet')}
      ]
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockOrderedList',
      pFlags: {reversed: true},
      start: 4,
      type: 'I',
      items: [
        {
          _: 'pageListOrderedItemText',
          pFlags: {checkbox: true, checked: true},
          num: 'IV',
          value: 4,
          type: 'I',
          text: text('Four')
        },
        {_: 'pageListOrderedItemText', pFlags: {}, value: 3, text: text('Three')}
      ]
    }]))).toBe(true);
  });

  test.each(['decimal', 'lower-alpha', 'lower-latin', 'upper-alpha', 'upper-latin', 'lower-roman', 'upper-roman', 'UPPER-ROMAN'])('accepts the supported ordered-list type %s on lists and items', (type) => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockOrderedList', pFlags: {}, type,
      items: [{_: 'pageListOrderedItemText', pFlags: {}, type, text: text('Item')}]
    }]))).toBe(true);
  });

  test.each(['unsupported', '__proto__', 'constructor', 'toString'])('rejects unsupported ordered-list type %s without treating it as decimal', (type) => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockOrderedList', pFlags: {}, type,
      items: [{_: 'pageListOrderedItemText', pFlags: {}, text: text('Item')}]
    }]))).toBe(false);
  });

  test('accepts lossless pullquotes and generic open and closed details', () => {
    expect(canSafelyEditRichMessage(richMessage([
      {
        _: 'pageBlockPullquote',
        text: {_: 'textBold', text: text('Pullquote')},
        caption: {_: 'textItalic', text: text('Author')}
      },
      {
        _: 'pageBlockDetails',
        pFlags: {open: true},
        title: {_: 'textBold', text: text('Open details')},
        blocks: [
          {_: 'pageBlockHeading3', text: text('Nested heading')},
          {
            _: 'pageBlockDetails',
            pFlags: {},
            title: {_: 'textItalic', text: text('Closed details')},
            blocks: [{_: 'pageBlockParagraph', text: {_: 'textStrike', text: text('Body')}}]
          }
        ]
      }
    ]))).toBe(true);
  });

  test('accepts quote captions and rejects malformed structures and inconsistent checkbox flags', () => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockBlockquote',
      pFlags: {},
      text: text('Quote'),
      caption: text('Credit')
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockDetails',
      pFlags: {},
      title: text('Title'),
      blocks: []
    }]))).toBe(false);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockDetails',
      pFlags: {},
      title: text('Title'),
      blocks: [{_: 'pageBlockDivider'}]
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockPullquote',
      text: text('Quote'),
      caption: {_: 'textImage', document_id: 1, w: 10, h: 10}
    }]))).toBe(false);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockList',
      items: [{_: 'pageListItemText', pFlags: {checked: true}, text: text('Invalid')}]
    }]))).toBe(false);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockOrderedList',
      pFlags: {},
      items: [{_: 'pageListOrderedItemText', pFlags: {checked: true}, text: text('Invalid')}]
    }]))).toBe(false);
  });

  test('rejects inline images and accepts both rich anchor forms', () => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textImage', document_id: 1, w: 10, h: 10}
    }]))).toBe(false);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textAnchor', name: 'anchor', text: text('target')}
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textAnchor', name: 'anchor', text: empty}
    }]))).toBe(true);
  });

  test('accepts server-resolved links and output-only wrappers that safely unwrap', () => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {
        _: 'textUrl',
        url: 'https://example.com',
        webpage_id: 42,
        text: {_: 'textAutoUrl', text: text('https://example.com')}
      }
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockFooter',
      text: {
        _: 'textDiff',
        text: text('new'),
        old_text: text('old')
      }
    }]))).toBe(true);
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: 1,
      caption: {
        _: 'pageCaption',
        text: {_: 'textImage', document_id: 2, w: 10, h: 10},
        credit: empty
      }
    }]))).toBe(false);
  });
});
