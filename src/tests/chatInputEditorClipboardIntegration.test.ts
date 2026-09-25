import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  tableDocument,
  currentTable
} from '@/tests/helpers/chatInputEditorHarness';
import type {JSONContent} from '@tiptap/core';
import {Slice} from '@tiptap/pm/model';
import {AllSelection, TextSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import {createChatInputEditorTestData} from '@components/chat/inputEditor/testData';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import type {PageBlock, Photo, RichMessage} from '@layer';

describe('Tiptap chat input editor: Clipboard', () => {
  const {mountEditor, mountInputFieldEditor, logicalContent} = useChatInputEditorHarness();

  test('routes every paste through ProseMirror', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const handlePaste = tiptap.view.someProp('handlePaste');
    const pasteEvent = (html: string) => {
      const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {
        value: {getData: (type: string) => type === 'text/html' ? html : ''}
      });
      return event;
    };

    expect(handlePaste?.(tiptap.view, pasteEvent('<p>text</p>'), Slice.empty)).toBe(false);
    expect(handlePaste?.(tiptap.view, pasteEvent('<table><tr><td>A</td></tr></table>'), Slice.empty)).toBe(false);

    tiptap.commands.setContent(tableDocument([['A', 'B'], ['C', 'D']]));
    tiptap.commands.setTextSelection(4);
    expect(handlePaste?.(tiptap.view, pasteEvent('<p>cell text</p>'), Slice.empty)).toBe(false);
  });

  test('imports semantic rich HTML through a real paste event', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const html = [
      '<h2>Heading</h2>',
      '<p><strong>Bold</strong> <tg-spoiler>hidden</tg-spoiler> H<sub>2</sub>O ',
      '<time datetime="2026-08-17T12:00:00Z">today</time> ',
      '<tg-emoji emoji-id="123456">🙂</tg-emoji> ',
      '<tg-math>x+y</tg-math><a name="inline-anchor"></a></p>',
      '<blockquote expandable><p>Collapsed</p><cite>Author</cite></blockquote>',
      '<aside>Pull quote<cite>Writer</cite></aside>',
      '<details open><summary>Summary</summary><p>Body</p></details>',
      '<ul><li><input type="checkbox" checked>Done</li>',
      '<li><input type="checkbox">Todo</li></ul>',
      '<ol><li><input type="checkbox" checked>Mixed check</li><li>Regular</li></ol>',
      '<footer>Footer</footer>',
      '<div class="math"><img data-tg-math="duplicate"><tg-math-block>x^2</tg-math-block></div>',
      '<figure class="table-wrap"><div class="table-title"><strong>Stats</strong></div>',
      '<table class="bordered striped"><tr><th>A</th><th>B</th></tr>',
      '<tr><td>1</td><td>2</td></tr></table></figure>',
      '<hr>'
    ].join('');
    const clipboardData = {
      getData: (type: string) => type === 'text/html' ? html :
        type === 'text/plain' || type === 'Text' ? 'Rich clipboard content' : ''
    };
    const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {value: clipboardData});

    tiptap.commands.selectAll();
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    const content = logicalContent(tiptap) as JSONContent[];
    expect(content.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'blockquote',
      'pullquote',
      'details',
      'taskList',
      'orderedList',
      'richFooter',
      'blockMath',
      'chatTableWrapper',
      'richDivider'
    ]);
    expect(content[1].content?.find((node) => node.text === 'hidden')?.marks)
    .toContainEqual({type: 'spoiler'});
    expect(content[1].content?.find((node) => node.type === 'customEmoji')?.attrs)
    .toMatchObject({documentId: '123456', emoji: '🙂'});
    expect(content[1].content?.find((node) => node.type === 'inlineMath')?.attrs)
    .toMatchObject({source: 'x+y'});
    expect(content[1].content?.find((node) => node.type === 'inlineRichAnchor')?.attrs)
    .toMatchObject({name: 'inline-anchor'});
    // an expandable quote of paragraphs stays collapsed in a rich message (layer 229)
    expect(content[2].attrs).toMatchObject({collapsed: true, rich: true});
    expect(content[2].content?.[content[2].content.length - 1]).toMatchObject({
      type: 'blockquoteCaption',
      content: [{text: 'Author'}]
    });
    expect(content[3]).toMatchObject({
      type: 'pullquote',
      content: [
        {type: 'pullquoteText', content: [{text: 'Pull quote'}]},
        {type: 'pullquoteCaption', content: [{text: 'Writer'}]}
      ]
    });
    expect(content[4]).toMatchObject({
      attrs: {open: true},
      content: [{type: 'detailsSummary'}, {type: 'detailsBody'}]
    });
    expect(content[5].content?.map((node) => node.attrs?.checked)).toEqual([true, false]);
    expect(content[6].content?.map((node) => node.attrs)).toEqual([
      expect.objectContaining({checkbox: true, checked: true}),
      expect.objectContaining({checkbox: null, checked: null})
    ]);
    expect(content[8].attrs?.source).toBe('x^2');
    expect(content[9]).toMatchObject({
      content: [{content: [{text: 'Stats', marks: [{type: 'bold'}]}]}, {
        attrs: {bordered: true, striped: true}
      }]
    });

    const rich = editor.getRichMessage({draft: true}).input.blocks;
    expect(rich.map((block) => block._)).toEqual([
      'pageBlockHeading2',
      'pageBlockParagraph',
      'pageBlockBlockquote',
      'pageBlockPullquote',
      'pageBlockDetails',
      'pageBlockList',
      'pageBlockOrderedList',
      'pageBlockFooter',
      'pageBlockMath',
      'pageBlockTable',
      'pageBlockDivider'
    ]);
  });

  test('captures a file-drop caret from viewport coordinates without moving the live selection', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('First line\nSecond line');
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size);
    const liveSelection = editor.captureSelection();
    vi.spyOn(tiptap.view, 'posAtCoords').mockReturnValue({inside: 0, pos: 3});

    expect(editor.captureSelectionAtPoint(100, 200)).toEqual({from: 3, to: 3});
    expect(editor.captureSelection()).toEqual(liveSelection);
  });

  test('keeps custom emoji metadata when copying outside a table', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A🔥B', [{_: 'messageEntityCustomEmoji', offset: 1, length: 2, document_id: '42'}]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));
    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    expect(copied.text).toBe('A🔥B');
    expect(copied.dom.innerHTML).toContain('data-doc-id="42"');
  });

  test('copies selected table-title text through both plain and rich serializers', () => {
    const {editor} = mountEditor();
    editor.insertTable({columns: 1, rows: 1});
    editor.setTableTitle('Metrics');
    const tiptap = (editor as TiptapEditorInternals).editor;
    let titlePosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'chatTableTitle') titlePosition = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc, titlePosition + 1, titlePosition + 8
    )));
    const serialize = tiptap.view.someProp('clipboardTextSerializer');
    expect(serialize?.(tiptap.state.selection.content(), tiptap.view)).toBe('Metrics');
    expect(editor.getSelectedRichMessage()?.output.blocks).toEqual([{
      _: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Metrics'}
    }]);
    const table = currentTable(tiptap);
    const cellStart = table.start + table.map.map[0] + 2;
    tiptap.view.dispatch(tiptap.state.tr.insertText('Cell', cellStart));
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc, titlePosition + 2, cellStart + 1
    )));
    expect(serialize?.(tiptap.state.selection.content(), tiptap.view)).toBe('etrics\nC');
  });

  test('copies quote body and author text across their structural boundary', () => {
    const {editor} = mountEditor();
    editor.setDocument({type: 'doc', content: [{type: 'blockquote', content: [
      {type: 'paragraph', content: [{type: 'text', text: 'Body'}]},
      {type: 'blockquoteCaption', content: [{type: 'text', text: 'Author'}]}
    ]}]});
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 3, 11)));
    const serialize = tiptap.view.someProp('clipboardTextSerializer');
    expect(serialize?.(tiptap.state.selection.content(), tiptap.view)).toBe('ody\nAut');
  });

  test('keeps rich-only inline marks and math in a text selection', () => {
    const {editor} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [{type: 'paragraph', content: [
        {type: 'text', text: 'Marked', marks: [{type: 'highlight'}]},
        {type: 'text', text: '2', marks: [{type: 'superscript'}]},
        {type: 'inlineMath', attrs: {source: 'x^2'}}
      ]}]
    });
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc, 1, tiptap.state.doc.firstChild!.nodeSize - 1
    )));
    expect(editor.getSelectedRichMessage()).toEqual(editor.getRichMessage());
  });

  test('replaces a selected code fragment without splitting its code block', () => {
    const {editor} = mountEditor();
    editor.setDocument({type: 'doc', content: [{
      type: 'codeBlock', attrs: {language: 'typescript'},
      content: [{type: 'text', text: 'const answer = 1;'}]
    }]});
    editor.restoreSelection({from: 7, to: 13}, false);
    const selected = editor.getSelectedRichMessage()!;
    expect(selected.output.blocks).toMatchObject([{
      _: 'pageBlockPreformatted', language: 'typescript', text: {_: 'textPlain', text: 'answer'}
    }]);
    const before = editor.getDocument();
    expect(editor.replaceDocumentRangeWithRichMessage(7, 13, selected.output)).toBe(true);
    expect(editor.getDocument()).toEqual(before);
  });

  test.each([false, true])('preserves media in an open rich fragment with nested quote=%s', (nested) => {
    const {editor} = mountEditor();
    editor.insertRichMedia([{
      type: 'photo',
      photo: {_: 'photo', id: '902', access_hash: '1', file_reference: new Uint8Array([1])} as Photo.photo,
      previewUrl: 'blob:selected-media'
    }]);
    const media = editor.getDocument().content![0];
    const content: JSONContent[] = [
      {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
      media,
      {type: 'paragraph', content: [{type: 'text', text: 'After'}]}
    ];
    editor.setDocument({type: 'doc', content: nested ? [{type: 'blockquote', content}] : content});
    const tiptap = (editor as TiptapEditorInternals).editor;
    let from = 0;
    let to = 0;
    tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === 'Before') from = position + 2;
      if(node.isText && node.text === 'After') to = position + 2;
    });
    editor.restoreSelection({from, to}, false);
    const before = editor.getRichMessage();
    const selected = editor.getSelectedRichMessage()!;
    const blocks = nested ? (selected.output.blocks[0] as PageBlock.pageBlockBlockquoteBlocks).blocks : selected.output.blocks;
    expect(blocks).toMatchObject([
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'fore'}},
      {_: 'pageBlockPhoto', photo_id: '902'},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Af'}}
    ]);
    expect(selected.output.photos.map((photo) => photo.id)).toEqual(['902']);
    expect(editor.replaceDocumentRangeWithRichMessage(from, to, selected.output)).toBe(true);
    expect(editor.getRichMessage()).toEqual(before);
  });

  test('round-trips open selections between adjacent rich text surfaces without changing the message', () => {
    const {editor} = mountEditor();
    const document = createChatInputEditorTestData({includeLocalMediaPreview: false});
    editor.setDocument(document);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const surfaces: {name: string, from: number, to: number}[] = [];
    tiptap.state.doc.descendants((node, position) => {
      if(node.isTextblock && node.content.size > 2) surfaces.push({
        name: `${node.type.name}: ${node.textContent.slice(0, 24)}`,
        from: position + 2,
        to: position + node.nodeSize - 2
      });
    });
    for(let index = 0; index < surfaces.length - 1; ++index) {
      editor.setDocument(document);
      const from = surfaces[index].from;
      const to = surfaces[index + 1].to;
      const label = `${surfaces[index].name} -> ${surfaces[index + 1].name}`;
      editor.restoreSelection({from, to}, false);
      const before = editor.getRichMessage();
      const selected = editor.getSelectedRichMessage()!;
      expect(editor.replaceDocumentRangeWithRichMessage(from, to, selected.output), label).toBe(true);
      expect(editor.getRichMessage(), label).toEqual(before);
    }
  });

  test('serializes and replaces an inline rich selection for AI compose', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('Alpha Beta', [{
      _: 'messageEntityBold',
      offset: 6,
      length: 4
    }]);
    tiptap.commands.setTextSelection({from: 7, to: 11});

    expect(editor.getSelectedRichMessage()?.output.blocks).toEqual([{
      _: 'pageBlockParagraph',
      text: {
        _: 'textBold',
        text: {_: 'textPlain', text: 'Beta'}
      }
    }]);

    const replacement: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {
          _: 'textItalic',
          text: {_: 'textPlain', text: 'Gamma'}
        }
      }],
      photos: [],
      documents: []
    };
    expect(editor.replaceDocumentRangeWithRichMessage(7, 11, replacement)).toBe(true);
    expect(editor.getRichValue()).toMatchObject({
      value: 'Alpha Gamma',
      entities: [{
        _: 'messageEntityItalic',
        offset: 6,
        length: 5
      }]
    });
  });

  test('restores a deleted whole-document AI result through Undo', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockHeader',
        text: {_: 'textPlain', text: 'Generated heading'}
      }, {
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Generated paragraph'}
      }, {
        _: 'pageBlockDivider'
      }],
      photos: [],
      documents: []
    };
    editor.separateHistory();
    expect(editor.setRichMessage(result)).toBe(true);
    editor.separateHistory();
    const generatedDocument = editor.getDocument();

    tiptap.commands.selectAll();
    expect(tiptap.commands.deleteSelection()).toBe(true);
    expect(editor.isEmpty()).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(generatedDocument);
  });

  test('keeps a range AI result as a separate undoable history event', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('Before');
    editor.focusAtEnd(false);
    const insertion = editor.captureSelection();
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {_: 'textBold', text: {_: 'textPlain', text: 'AI result'}}
      }],
      photos: [],
      documents: []
    };
    editor.separateHistory();
    expect(editor.replaceDocumentRangeWithRichMessage(
      insertion.from,
      insertion.to,
      result
    )).toBe(true);
    editor.separateHistory();
    const generatedDocument = editor.getDocument();
    const generated = tiptap.state.doc.textBetween(0, tiptap.state.doc.content.size, '\n');
    expect(generated).toContain('AI result');

    let from = -1;
    tiptap.state.doc.descendants((node, position) => {
      const offset = node.isText ? node.text?.indexOf('AI result') ?? -1 : -1;
      if(offset < 0) return;
      from = position + offset;
      return false;
    });
    expect(from).toBeGreaterThanOrEqual(0);
    const to = from + 'AI result'.length;
    tiptap.view.dispatch(tiptap.state.tr.delete(from, to));
    expect(editor.getRichValue(false, false).value).not.toContain('AI result');
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(generatedDocument);
  });

  test('copies only the rectangular table cell selection', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.commands.setContent(tableDocument([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]));

    const {map, start: tableStart} = currentTable(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      tableStart + map.map[1],
      tableStart + map.map[map.width + 1]
    )));
    const serializeClipboard = tiptap.view.someProp('clipboardTextSerializer');

    expect(serializeClipboard?.(tiptap.state.selection.content(), tiptap.view)).toBe('B\nE');
  });

  test('copies lists as their canonical Telegram text with markers', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('- first\n- second');
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.selectAll()).toBe(true);
    const serializeClipboard = tiptap.view.someProp('clipboardTextSerializer');

    expect(serializeClipboard?.(tiptap.state.selection.content(), tiptap.view)).toBe('- first\n- second');
  });

  test('keeps mixed checklist attributes in copied rich HTML', () => {
    const {editor} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        content: [{
          type: 'listItem',
          attrs: {checkbox: true, checked: false},
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Todo'}]}]
        }, {
          type: 'listItem',
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Regular'}]}]
        }]
      }]
    })).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));

    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());

    expect(copied.dom.querySelector('li[data-checkbox="true"][data-checked="false"]'))
    .not.toBeNull();
    expect(copied.dom.querySelectorAll('li[data-checkbox]')).toHaveLength(1);
  });

  test('pastes a copied sole paragraph inline when it has no trailing newline', () => {
    const {editor} = mountInputFieldEditor();
    editor.setTextWithEntities('copied', [{
      _: 'messageEntityBold',
      offset: 0,
      length: 6
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc))
    );
    const clipboard = new Map<string, string>();
    const clipboardData = {
      clearData: () => clipboard.clear(),
      getData: (type: string) => clipboard.get(type) || '',
      setData: (type: string, value: string) => {
        clipboard.set(type, value);
        return true;
      }
    };
    const copyEvent = new Event('copy', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(copyEvent, 'clipboardData', {value: clipboardData});
    tiptap.view.dispatchEvent(copyEvent);

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboard.get('text/plain')).toBe('copied');
    expect(clipboard.get('text/html')).toContain('data-pm-slice="1 1');

    tiptap.commands.setTextSelection(tiptap.state.doc.firstChild!.nodeSize - 1);
    const pasteEvent = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {value: clipboardData});
    tiptap.view.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(editor.getDocument()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{type: 'bold'}],
          text: 'copiedcopied'
        }]
      }]
    });
  });

  test.each([
    ['multiple blocks', 'first\nsecond'],
    ['a trailing newline', 'copied\n']
  ])('keeps %s structural when copying the full document', (_name, value) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities(value);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc))
    );
    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());

    expect(copied.text).toBe(value);
    expect(copied.slice.openStart).toBe(0);
    expect(copied.slice.openEnd).toBe(0);
  });

  test('pastes a closed single-paragraph clipboard slice inline when its text has no newline', () => {
    const {editor} = mountInputFieldEditor();
    editor.setTextWithEntities('beforeafter');
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.commands.setTextSelection(7);
    const clipboard = new Map<string, string>([
      ['text/plain', 'copied'],
      ['text/html', '<p data-pm-slice="0 0 []"><strong>copied</strong></p>']
    ]);
    const pasteEvent = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: (type: string) => clipboard.get(type) || ''
      }
    });

    tiptap.view.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(editor.getDocument()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before'},
          {type: 'text', marks: [{type: 'bold'}], text: 'copied'},
          {type: 'text', text: 'after'}
        ]
      }]
    });
  });

  test.each([
    {
      blocks: ['before', 'copied', 'after'],
      html: '<p data-pm-slice="0 0 []"><strong>copied</strong></p>',
      name: 'a trailing newline',
      text: 'copied\n'
    },
    {
      blocks: ['before', 'first', 'second', 'after'],
      html: '<p data-pm-slice="0 0 []">first</p><p>second</p>',
      name: 'multiple blocks',
      text: 'first\nsecond'
    }
  ])('does not flatten $name from a closed clipboard slice', ({blocks, html, text}) => {
    const {editor} = mountInputFieldEditor();
    editor.setTextWithEntities('beforeafter');
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.commands.setTextSelection(7);
    const pasteEvent = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: (type: string) => type === 'text/plain' ? text : type === 'text/html' ? html : ''
      }
    });

    tiptap.view.dispatchEvent(pasteEvent);

    const content = editor.getDocument().content || [];
    expect(content.map((node) => node.content?.[0]?.text || ''))
    .toEqual(blocks);
  });

  test('reads list markers and nested numbering from clipboard HTML', () => {
    const source = document.createElement('body');
    source.innerHTML = [
      '<ul>',
      '<li>first</li>',
      '<li><strong>bold</strong><ol start="9"><li>nested</li><li>next</li></ol></li>',
      '</ul>'
    ].join('');
    const value = getRichValueWithCaret(source, true, false);

    expect(value.value).toBe('- first\n- bold\n  9. nested\n  10. next');
    expect(value.entities).toContainEqual({
      _: 'messageEntityBold',
      offset: value.value.indexOf('bold'),
      length: 4
    });
  });

  test.each([false, true])('preserves the starting number of a copied list subset with reversed=%s', (reversed) => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setDocument({type: 'doc', content: [{
      type: 'orderedList', attrs: {start: 7, startExplicit: true, reversed},
      content: ['First', 'Second', 'Third'].map((text) => ({
        type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text}]}]
      }))
    }]});
    const before = editor.getRichMessage();
    const original = before.output.blocks[0] as PageBlock.pageBlockOrderedList;
    const positions: number[] = [];
    tiptap.state.doc.descendants((node, position) => {
      if(node.isTextblock && ['Second', 'Third'].includes(node.textContent)) positions.push(position + 1);
    });
    editor.restoreSelection({from: positions[0], to: positions[1] + 5}, false);
    const fragment = editor.getSelectedRichMessage()!;
    const selected = fragment.output.blocks[0] as PageBlock.pageBlockOrderedList;
    expect(selected.items).toEqual(original.items.slice(1));
    expect(selected.start).toBe(reversed ? 6 : 8);
    const clipboard = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    const list = clipboard.dom.querySelector('ol')!;
    expect(list.getAttribute('start')).toBe(String(reversed ? 6 : 8));
    expect(list.hasAttribute('reversed')).toBe(reversed);
    expect(editor.replaceDocumentRangeWithRichMessage(positions[0], positions[1] + 5, fragment.output)).toBe(true);
    expect(editor.getRichMessage()).toEqual(before);
  });

  test('keeps formatted-date flags in clipboard HTML', () => {
    const span = document.createElement('span');
    span.className = 'formatted-date';
    span.dataset.date = '1784635200';
    span.dataset.dateFlags = 'relative,long_time,day_of_week';
    span.textContent = 'next week';
    const fragment = document.createDocumentFragment();
    fragment.append(span);

    expect(getRichValueWithCaret(fragment, true, false)).toEqual({
      value: 'next week',
      entities: [{
        _: 'messageEntityFormattedDate',
        offset: 0,
        length: 9,
        date: 1784635200,
        pFlags: {relative: true, long_time: true, day_of_week: true}
      }],
      caretPos: -1
    });
  });
});
