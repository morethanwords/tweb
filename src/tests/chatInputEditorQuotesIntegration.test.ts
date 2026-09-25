import {useChatInputEditorHarness, TiptapEditorInternals, findEntity} from '@/tests/helpers/chatInputEditorHarness';
import {TextSelection} from '@tiptap/pm/state';
import {instantViewStyles} from '@components/instantViewFormatting';

describe('Tiptap chat input editor: Quotes', () => {
  const {mountEditor, logicalContent, applyToText} = useChatInputEditorHarness();

  test('wraps selected text in a Telegram blockquote', () => {
    const quoted = applyToText('quote');

    expect(quoted.value).toBe('sample');
    expect(findEntity(quoted.entities, 'messageEntityBlockquote')).toEqual({
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 6,
      pFlags: {collapsed: undefined}
    });
  });

  test('splits a selected part of a paragraph into a standalone quote block', () => {
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('before selected after');
    editor.restoreSelection({from: 8, to: 16}, false);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false)).toEqual({
      value: 'before\nselected\nafter',
      entities: [{
        _: 'messageEntityBlockquote',
        offset: 7,
        length: 8,
        pFlags: {collapsed: undefined}
      }],
      caretPos: -1
    });
    expect(logicalContent((editor as TiptapEditorInternals).editor).map((node) => node.type))
    .toEqual(['paragraph', 'blockquote', 'paragraph']);
    const quote = input.querySelector<HTMLElement>('[data-chat-input-blockquote]');
    expect(quote?.classList.contains(instantViewStyles.Padding)).toBe(true);
    expect(quote?.querySelector('blockquote')?.textContent).toBe('selected');
    expect(quote?.querySelector('blockquote')?.classList.contains('quote-block')).toBe(true);
    expect(input.querySelector('span.quote')).toBeNull();
    expect(editor.getMarkupState('quote')).toEqual({fully: true, partly: true});

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false).entities).toEqual([]);
    expect(logicalContent((editor as TiptapEditorInternals).editor).map((node) => node.type))
    .toEqual(['paragraph', 'paragraph', 'paragraph']);
  });

  for(const expanded of [false, true]) for(const backward of [false, true]) {
    test.each([
      {name: 'text only', breaks: 1, leading: 0, trailing: 0},
      {name: 'selected leading break', breaks: 1, leading: 1, trailing: 0},
      {name: 'selected trailing break', breaks: 1, leading: 0, trailing: 1},
      {name: 'authored blank lines', breaks: 2, leading: 0, trailing: 0}
    ])(`quotes a middle line: $name (expanded=${expanded}, backward=${backward})`, ({breaks, leading, trailing}) => {
      const {editor} = mountEditor();
      const lineBreaks = Array.from({length: breaks}, () => ({type: 'hardBreak'}));
      editor.setDocument({type: 'doc', content: [{type: 'paragraph', content: [
        {type: 'text', text: 'first'}, ...lineBreaks,
        {type: 'text', text: 'second', marks: [{type: 'bold'}]}, ...lineBreaks,
        {type: 'text', text: 'third'}
      ]}]});
      editor.setExpanded(expanded);
      const from = 6 + breaks - leading;
      const to = 12 + breaks + trailing;
      editor.restoreSelection({from, to, backward: backward || undefined}, false);
      const original = editor.getDocument();
      const originalSelectionText = editor.getSelectedText();
      expect(editor.applyMarkup({type: 'quote'})).toBe(true);
      const quoted = editor.getDocument();
      expect(editor.getRichValue(true, false).value).toBe(`first${'\n'.repeat(breaks)}second${'\n'.repeat(breaks)}third`);
      expect(quoted.content?.[1].content?.[0].content).toEqual([{type: 'text', text: 'second', marks: [{type: 'bold'}]}]);
      expect(editor.undo()).toBe(true);
      expect(editor.getDocument()).toEqual(original);
      expect(editor.getSelectedText()).toBe(originalSelectionText);
      expect(editor.redo()).toBe(true);
      expect(editor.getDocument()).toEqual(quoted);
      expect(editor.applyMarkup({type: 'quote'})).toBe(true);
      expect(editor.getRichValue(true, false).entities.some(entity => entity._ === 'messageEntityBlockquote')).toBe(false);
      expect(editor.undo()).toBe(true);
      expect(editor.getDocument()).toEqual(quoted);
    });
  }

  test.each([
    {edge: {type: 'text', text: ' '}, expected: 'quoted'},
    {edge: {type: 'hardBreak'}, expected: '\nquoted\n'}
  ])('keeps authored edge lines when quoting ($edge.type)', ({edge, expected}) => {
    const {editor} = mountEditor();
    editor.setDocument({type: 'doc', content: [{type: 'paragraph', content: [
      edge, {type: 'text', text: 'quoted'}, edge
    ]}]});
    editor.restoreSelection({from: 2, to: 8}, false);
    const original = editor.getDocument();
    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false).value).toBe(expected);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(original);
  });

  test.each([false, true])('keeps quote creation undoable across composer expansion (initial=%s)', (expanded) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('first second third');
    editor.setExpanded(expanded);
    editor.restoreSelection({from: 7, to: 13}, false);
    const before = editor.getDocument();
    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    editor.setExpanded(!expanded);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.redo()).toBe(true);
    expect(editor.getRichValue(true, false).value).toBe('first\nsecond\nthird');
    expect(editor.getMarkupState('quote').fully).toBe(true);
  });

  test.each([false, true])('copies a quote without its empty author placeholder (expanded=%s)', (expanded) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Before\nQuote\nAfter', [{_: 'messageEntityBlockquote', offset: 7, length: 5, pFlags: {}}]);
    editor.setExpanded(expanded);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.commands.selectAll();
    const copied = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    expect(copied.text).toBe('Before\nQuote\nAfter');
    expect(copied.dom.querySelector('[data-blockquote-caption-content]')).toBeNull();
    const pasted = mountEditor();
    const destination = (pasted.editor as TiptapEditorInternals).editor;
    expect(destination.view.pasteHTML(copied.dom.innerHTML, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(pasted.editor.getRichValue(true, false).value).toBe('Before\nQuote\nAfter');
  });

  test('migrates an old inline-quote hot-reload snapshot to block nodes', () => {
    const {editor} = mountEditor({
      doc: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            {type: 'text', text: 'before '},
            {
              type: 'text',
              text: 'selected',
              marks: [{type: 'inlineQuote', attrs: {collapsed: false}}]
            },
            {type: 'text', text: ' after'}
          ]
        }]
      },
      editable: true,
      focused: false,
      selection: {from: 1, to: 1}
    });

    expect(editor.getDocument().content?.map((node) => node.type))
    .toEqual(['paragraph', 'blockquote', 'paragraph']);
    expect(JSON.stringify(editor.getDocument())).not.toContain('inlineQuote');
    expect(editor.getRichValue(true, false).value).toBe('before\nselected\nafter');
  });

  test('unquotes only the selected part of an existing blockquote', () => {
    const {editor} = mountEditor();
    const text = 'before selected after';
    editor.setTextWithEntities(text, [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: text.length,
      pFlags: {}
    }]);
    editor.restoreSelection({from: 9, to: 17}, false);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false)).toEqual({
      value: 'before\nselected\nafter',
      entities: [
        {
          _: 'messageEntityBlockquote',
          offset: 0,
          length: 6,
          pFlags: {collapsed: undefined}
        },
        {
          _: 'messageEntityBlockquote',
          offset: 16,
          length: 5,
          pFlags: {collapsed: undefined}
        }
      ],
      caretPos: -1
    });
    expect(logicalContent((editor as TiptapEditorInternals).editor).map((node) => node.type))
    .toEqual(['blockquote', 'paragraph', 'blockquote']);
    expect(editor.getMarkupState('quote')).toEqual({fully: false, partly: false});
  });

  test('preserves code in the quoted remainder when partially unquoting', () => {
    const {editor} = mountEditor();
    const text = 'code plain';
    editor.setTextWithEntities(text, [
      {_: 'messageEntityBlockquote', offset: 0, length: text.length, pFlags: {}},
      {_: 'messageEntityCode', offset: 0, length: 4}
    ]);
    editor.restoreSelection({from: 7, to: 12}, false);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false).entities).toEqual([
      {_: 'messageEntityCode', offset: 0, length: 4},
      {
        _: 'messageEntityBlockquote',
        offset: 0,
        length: 4,
        pFlags: {collapsed: undefined}
      }
    ]);
  });

  test.each([
    ['monospace', {}, 'messageEntityCode'],
    ['date', {dateSuffix: '1784635200'}, 'messageEntityFormattedDate']
  ] as const)('preserves a block quote when applying %s', (type, options, entityType) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('xquotedx', [{
      _: 'messageEntityBlockquote',
      offset: 1,
      length: 6,
      pFlags: {}
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    let from = 0;
    let to = 0;
    tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === 'quoted') {
        from = position;
        to = position + node.nodeSize;
      }
    });
    editor.restoreSelection({from, to}, false);

    expect(editor.applyMarkup({type, ...options})).toBe(true);
    const richValue = editor.getRichValue(true, false);
    const offset = richValue.value.indexOf('quoted');
    expect(findEntity(richValue.entities, 'messageEntityBlockquote')).toMatchObject({offset, length: 6});
    expect(findEntity(richValue.entities, entityType)).toMatchObject({offset, length: 6});
    expect(logicalContent(tiptap).map((node) => node.type))
    .toEqual(['paragraph', 'blockquote', 'paragraph']);
  });

  test('preserves a backward text selection while normalizing a quote', () => {
    const {editor} = mountEditor();
    const text = 'before selected after';
    editor.setTextWithEntities(text, [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: text.length,
      pFlags: {}
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 17, 9)));

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(tiptap.state.selection.anchor).toBeGreaterThan(tiptap.state.selection.head);
    expect(logicalContent(tiptap).map((node) => node.type))
    .toEqual(['blockquote', 'paragraph', 'blockquote']);
  });

  test('applies quote to a mixed plain and structural selection without overlapping entities', () => {
    const {editor} = mountEditor();
    const text = 'plain\nquoted';
    editor.setTextWithEntities(text, [{
      _: 'messageEntityBlockquote',
      offset: 6,
      length: 6,
      pFlags: {}
    }]);
    editor.restoreSelection({from: 3, to: 15}, false);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    const document = (editor as TiptapEditorInternals).editor.getJSON();
    expect(JSON.stringify(document)).not.toContain('inlineQuote');
    expect(document.content?.every((node) => (
      node.type === 'paragraph' || node.type === 'blockquote'
    ))).toBe(true);
    expect(document.content?.some((node) => node.type === 'blockquote')).toBe(true);
  });

  test('quoting a select-all leaves the technical trailing paragraph outside', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Caption');
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.selectAll()).toBe(true);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);

    // Swallowing the placeholder sends a trailing newline inside the quote.
    const quoted = editor.getRichValue(true);
    expect(quoted.value).toBe('Caption');
    expect(findEntity(quoted.entities, 'messageEntityBlockquote')).toMatchObject({
      offset: 0,
      length: 7
    });
  });

  test('preserves an all-document selection while normalizing structural quotes', () => {
    const {editor} = mountEditor();
    const text = 'plain\nquoted';
    editor.setTextWithEntities(text, [{
      _: 'messageEntityBlockquote',
      offset: 6,
      length: 6,
      pFlags: {}
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.selectAll()).toBe(true);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(tiptap.state.selection.constructor.name).toBe('AllSelection');
    expect(tiptap.getJSON().content?.[0].type).toBe('blockquote');
    expect(JSON.stringify(tiptap.getJSON())).not.toContain('inlineQuote');
  });

  test('lifts a whole list item into a standalone quote block', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('- item');
    editor.restoreSelection({from: 3, to: 7}, false);

    expect(editor.applyMarkup({type: 'quote'})).toBe(true);
    expect(editor.getRichValue(true, false)).toEqual({
      value: 'item',
      entities: [{
        _: 'messageEntityBlockquote',
        offset: 0,
        length: 4,
        pFlags: {collapsed: undefined}
      }],
      caretPos: -1
    });
    expect((editor as TiptapEditorInternals).editor.getJSON().content?.[0].type).toBe('blockquote');
  });
});
