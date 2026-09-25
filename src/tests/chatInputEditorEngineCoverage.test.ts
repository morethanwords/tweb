import type {Editor, JSONContent} from '@tiptap/core';
import {AllSelection, NodeSelection} from '@tiptap/pm/state';
import '@/tests/mocks/chatInputEditorEngineUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import type {PageBlock, Photo, RichMessage, RichText} from '@layer';
import type wrapPhoto from '@components/wrappers/photo';

const photoRenderMocks = vi.hoisted(() => ({
  createResult: (): Awaited<ReturnType<typeof wrapPhoto>> => ({
    aspecter: null,
    images: {full: null, thumb: null},
    loadPromises: {full: Promise.resolve(), thumb: Promise.resolve()},
    preloader: null
  })
}));

vi.mock('@components/wrappers/photo', () => ({
  default: vi.fn(async() => photoRenderMocks.createResult())
}));

vi.mock('@components/wrappers/document', () => ({
  default: vi.fn(async() => document.createElement('div'))
}));

vi.mock('@components/wrappers/video', () => ({
  default: vi.fn(async() => document.createElement('video'))
}));

type TiptapEditorInternals = ChatInputEditor & {
  editor: Editor
};

const EMPTY_RICH_TEXT: RichText.textEmpty = {_: 'textEmpty'};
const EMPTY_CAPTION = {
  _: 'pageCaption' as const,
  credit: EMPTY_RICH_TEXT,
  text: EMPTY_RICH_TEXT
};

function richMessage(blocks: PageBlock[], pFlags: RichMessage['pFlags'] = {}): RichMessage {
  return {
    _: 'richMessage',
    pFlags,
    blocks,
    photos: [],
    documents: []
  };
}

describe('chat input editor rich engine coverage', () => {
  const editors: ChatInputEditor[] = [];

  function mountEditor(snapshot?: ReturnType<ChatInputEditor['snapshot']>) {
    const mounted = mountChatInputEditor({}, snapshot);
    editors.push(mounted.editor);
    return mounted;
  }

  afterEach(async() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    // Finish NodeView imports while this suite's renderer mocks still exist.
    await vi.dynamicImportSettled();
    document.body.replaceChildren();
  });

  const photo = (id: string) => ({_: 'photo', id, access_hash: '1', file_reference: new Uint8Array([1])}) as Photo.photo;
  function prepareMedia(editor: ChatInputEditor, grouped = true) {
    editor.setTextWithEntities('');
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo('1')},
      {type: 'photo', photo: photo('2')}
    ], {grouped, caption: 'First'})).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(grouped ?
      NodeSelection.create(tiptap.state.doc, 0) : new AllSelection(tiptap.state.doc)
    ));
  }

  const historyCommands: Array<{
    name: string,
    nodeType: string,
    prepare?: (editor: ChatInputEditor) => void,
    run: (editor: ChatInputEditor) => boolean,
    text?: string
  }> = [
    ...([
      'bold', 'italic', 'underline', 'strikethrough', 'monospace', 'spoiler',
      'highlight', 'subscript', 'superscript', 'quote', 'date', 'link'
    ] as const).map((type) => ({
      name: `markup ${type}`,
      nodeType: type === 'quote' ? 'blockquote' : 'paragraph',
      prepare: (editor: ChatInputEditor) => editor.restoreSelection({from: 1, to: 6}, false),
      run: (editor: ChatInputEditor) => editor.applyMarkup({
        type,
        ...(type === 'date' ? {dateSuffix: '1788640000'} : {}),
        ...(type === 'link' ? {href: 'https://telegram.org'} : {})
      })
    })),
    ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
      name: `heading ${level}`,
      nodeType: 'heading',
      run: (editor: ChatInputEditor) => editor.toggleHeading(level)
    })),
    {name: 'bullet list', nodeType: 'bulletList', run: (editor) => editor.toggleBulletList()},
    {name: 'ordered list', nodeType: 'orderedList', run: (editor) => editor.toggleOrderedList()},
    {name: 'task list', nodeType: 'taskList', run: (editor) => editor.toggleTaskList()},
    {
      name: 'list start', nodeType: 'orderedList',
      prepare: (editor) => editor.toggleOrderedList(),
      run: (editor) => editor.setOrderedListStart(7)
    },
    {
      name: 'list item value', nodeType: 'orderedList',
      prepare: (editor) => editor.toggleOrderedList(),
      run: (editor) => editor.setOrderedListItemValue(42)
    },
    {name: 'code block', nodeType: 'codeBlock', run: (editor) => editor.insertCodeBlock()},
    {
      name: 'code language', nodeType: 'codeBlock',
      prepare: (editor) => editor.insertCodeBlock(),
      run: (editor) => editor.setCodeBlockLanguage('typescript')
    },
    {name: 'inline math', nodeType: 'paragraph', run: (editor) => editor.insertInlineMath('x^2')},
    {name: 'block math', nodeType: 'blockMath', run: (editor) => editor.insertBlockMath('x^2')},
    {name: 'pullquote', nodeType: 'pullquote', run: (editor) => editor.insertPullquote({text: 'Quote'})},
    {name: 'details', nodeType: 'details', run: (editor) => editor.insertDetails({title: 'Title', body: 'Body'})},
    {name: 'footer', nodeType: 'richFooter', run: (editor) => editor.insertFooter({text: 'Note'})},
    {name: 'divider', nodeType: 'richDivider', run: (editor) => editor.insertDivider()},
    {name: 'table', nodeType: 'chatTableWrapper', run: (editor) => editor.insertTable()},
    ...([
      ['table title', (editor: ChatInputEditor) => editor.setTableTitle('Title')],
      ['table borders', (editor: ChatInputEditor) => editor.toggleTableBordered()],
      ['table stripes', (editor: ChatInputEditor) => editor.toggleTableStriped()],
      ['table header', (editor: ChatInputEditor) => editor.toggleTableHeaderRow()]
    ] as const).map(([name, run]) => ({
      name,
      nodeType: 'chatTableWrapper',
      prepare: (editor: ChatInputEditor) => editor.insertTable({columns: 2, rows: 2}),
      run
    })),
    {
      name: 'table column before', nodeType: 'chatTableWrapper',
      prepare: (editor) => editor.insertTable({columns: 2, rows: 2}),
      run: (editor) => editor.addTableColumnBefore()
    },
    {
      name: 'table row before', nodeType: 'chatTableWrapper',
      prepare: (editor) => editor.insertTable({columns: 2, rows: 2}),
      run: (editor) => editor.addTableRowBefore()
    },
    {
      name: 'text range replacement', nodeType: 'paragraph',
      run: (editor) => editor.replaceTextRange(1, 4, 'XYZ'),
      text: 'FXYZt'
    },
    {
      name: 'media insertion', nodeType: 'richMedia',
      run: (editor) => editor.insertRichMedia([{type: 'photo', photo: photo('3')}])
    },
    ...([
      ['media add', (editor: ChatInputEditor) => editor.addRichMediaItems(0, 0, [{type: 'photo', photo: photo('3')}])],
      ['media replace', (editor: ChatInputEditor) => editor.replaceRichMediaItem(0, 1, {type: 'photo', photo: photo('3')})],
      ['media layout', (editor: ChatInputEditor) => editor.toggleRichMediaLayout()],
      ['media ungroup', (editor: ChatInputEditor) => editor.ungroupSelectedRichMedia()]
    ] as const).map(([name, run]) => ({name, nodeType: 'richMedia', prepare: prepareMedia, run})),
    ...(['collage', 'slideshow'] as const).map((layout) => ({
      name: `media group ${layout}`, nodeType: 'richMedia',
      prepare: (editor: ChatInputEditor) => prepareMedia(editor, false),
      run: (editor: ChatInputEditor) => editor.groupSelectedRichMedia(layout)
    }))
  ];

  test.each(historyCommands)('undoes, redoes and branches history for $name', ({nodeType, prepare, run, text}) => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('First');
    editor.focusAtEnd();
    prepare?.(editor);
    const selected = editor.captureSelection();
    expect(editor.setDocument(editor.getDocument())).toBe(true);
    editor.restoreSelection(selected, false);
    const before = editor.getDocument();
    const beforeText = editor.getRichValue(true, false);
    const beforeRich = editor.getRichMessage();
    expect(editor.canUndo()).toBe(false);

    expect(run(editor)).toBe(true);
    const after = editor.getDocument();
    const afterText = editor.getRichValue(true, false);
    const afterRich = editor.getRichMessage();
    expect(after).not.toEqual(before);
    expect(after.content?.some((node) => node.type === nodeType)).toBe(true);
    expect(afterText.value).toContain(text || 'First');
    expect(() => tiptap.state.doc.check()).not.toThrow();

    for(let cycle = 0; cycle < 3; ++cycle) {
      expect(editor.undo()).toBe(true);
      expect(editor.getDocument()).toEqual(before);
      expect(editor.getRichValue(true, false)).toEqual(beforeText);
      expect(editor.getRichMessage()).toEqual(beforeRich);
      expect(editor.redo()).toBe(true);
      expect(editor.getDocument()).toEqual(after);
      expect(editor.getRichValue(true, false)).toEqual(afterText);
      expect(editor.getRichMessage()).toEqual(afterRich);
      expect(() => tiptap.state.doc.check()).not.toThrow();
    }

    expect(editor.undo()).toBe(true);
    expect(editor.replaceSelection('Branch')).toBe(true);
    expect(editor.canRedo()).toBe(false);
    expect(() => tiptap.state.doc.check()).not.toThrow();
  });

  test('keeps media editable and anchors invisible and non-selectable through snapshots', () => {
    const photo: PageBlock.pageBlockPhoto = {
      _: 'pageBlockPhoto',
      pFlags: {spoiler: true},
      photo_id: '10',
      caption: EMPTY_CAPTION
    };
    const video: PageBlock.pageBlockVideo = {
      _: 'pageBlockVideo',
      pFlags: {},
      video_id: '11',
      caption: EMPTY_CAPTION
    };
    const blocks: PageBlock[] = [
      {_: 'pageBlockDivider'},
      {_: 'pageBlockAnchor', name: 'section'},
      photo,
      {_: 'pageBlockCollage', items: [photo], caption: EMPTY_CAPTION},
      {_: 'pageBlockSlideshow', items: [video], caption: EMPTY_CAPTION},
      {
        _: 'inputPageBlockMap',
        geo: {_: 'inputGeoPoint', lat: 25.2048, long: 55.2708},
        zoom: 12,
        w: 640,
        h: 360,
        caption: EMPTY_CAPTION
      },
      {_: 'pageBlockFooter', text: {_: 'textPlain', text: 'Footer'}}
    ];
    const source = richMessage(blocks);
    const {editor, input} = mountEditor();

    expect(editor.setRichMessage(source)).toBe(true);
    expect(editor.getDocument().content?.map((node) => node.type)).toEqual([
      'richDivider',
      'richAnchor',
      'richMedia',
      'richMedia',
      'richMedia',
      'richMap',
      'richFooter'
    ]);
    const anchor = input.querySelector<HTMLElement>(
      '[data-rich-anchor]'
    );
    expect(anchor?.classList.contains('chat-input-rich-anchor-block')).toBe(true);
    expect(anchor?.getAttribute('aria-hidden')).toBe('true');
    expect(anchor?.hasAttribute('aria-label')).toBe(false);
    expect(anchor?.dataset.anchorName).toBe('section');
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.getText()).not.toContain('Anchor');
    expect(tiptap.state.doc.child(1).type.name).toBe('richAnchor');
    expect(NodeSelection.isSelectable(tiptap.state.doc.child(1))).toBe(false);
    expect(input.querySelector('[data-rich-divider]')).not.toBeNull();
    expect(input.querySelector<HTMLElement>('[data-rich-map]')?.dataset.richBlock)
    .toContain('inputPageBlockMap');
    expect(input.querySelector('[data-rich-footer]')?.textContent).toBe('Footer');
    expect([...input.querySelectorAll<HTMLElement>('.chat-input-rich-media-preview')]
    .map((element) => element.getAttribute('aria-label'))).toEqual([
      'Photo',
      'Collage',
      'Slideshow'
    ]);
    expect(editor.isEmpty()).toBe(false);
    expect(editor.getRichMessage().output.blocks).toEqual(blocks);

    const restored = mountEditor(editor.snapshot()).editor;
    expect(restored.getRichMessage().output.blocks).toEqual(blocks);
  });

  test.each([
    {kind: 'map', stage: 'initialization'},
    {kind: 'map', stage: 'download'},
    {kind: 'media', stage: 'initialization'},
    {kind: 'media', stage: 'download'}
  ])('keeps $kind captions editable when preview $stage fails', async({kind, stage}) => {
    const photoModule = await import('@components/wrappers/photo');
    const wrapPhoto = vi.mocked(photoModule.default).mockClear().mockImplementationOnce(async() => {
      if(stage === 'initialization') throw new Error('Map preview unavailable');
      const result = photoRenderMocks.createResult();
      result.loadPromises.full = Promise.reject(new Error('Map download failed'));
      return result;
    });
    try {
      const {editor, input} = mountEditor();
      expect(kind === 'map' ? editor.insertMap({latitude: 51.5074, longitude: -0.1278}) :
        editor.insertRichMedia([{type: 'photo', photo: photo('4')}])
      ).toBe(true);
      const original = editor.getDocument();
      await vi.waitFor(() => expect(wrapPhoto).toHaveBeenCalledOnce());
      expect(editor.getDocument()).toEqual(original);
      expect(input.querySelector(`.chat-input-rich-${kind}`)).not.toBeNull();

      editor.restoreSelection({from: 1, to: 1}, false);
      expect(editor.replaceSelection('Caption')).toBe(true);
      expect(editor.getDocument().content?.[0].content).toEqual([{type: 'text', text: 'Caption'}]);
    } finally {
      wrapPhoto.mockReset().mockImplementation(async() => photoRenderMocks.createResult());
    }
  });

  test('authors advanced blocks and rejects incomplete required fields', () => {
    const {editor} = mountEditor();
    const map: PageBlock.inputPageBlockMap = {
      _: 'inputPageBlockMap',
      geo: {_: 'inputGeoPoint', lat: 25.2048, long: 55.2708},
      zoom: 12,
      w: 640,
      h: 360,
      caption: EMPTY_CAPTION
    };

    expect(editor.insertOpaqueRichBlock({_: 'pageBlockFooter', text: EMPTY_RICH_TEXT})).toBe(false);
    expect(editor.insertOpaqueRichBlock({_: 'pageBlockAnchor', name: '  '})).toBe(false);
    expect(editor.insertOpaqueRichBlock({...map, w: 0})).toBe(false);
    expect(editor.insertOpaqueRichBlock({...map, geo: {_: 'inputGeoPointEmpty'}})).toBe(false);
    expect(editor.insertMap({latitude: 91, longitude: 0})).toBe(false);
    expect(editor.insertMap({latitude: 0, longitude: 181})).toBe(false);
    expect(editor.insertMap({latitude: 0, longitude: 0, zoom: 0})).toBe(false);

    const blocks = [
      {
        _: 'pageBlockFooter' as const,
        text: {_: 'textBold' as const, text: {_: 'textPlain' as const, text: 'Footnote'}}
      },
      {_: 'pageBlockDivider' as const},
      {_: 'pageBlockAnchor' as const, name: 'footnote'},
      map
    ];
    expect(editor.insertOpaqueRichBlock(blocks[0])).toBe(true);
    expect(editor.insertOpaqueRichBlock(blocks[1])).toBe(true);
    expect(editor.insertOpaqueRichBlock(blocks[2])).toBe(true);
    expect(editor.insertOpaqueRichBlock(map)).toBe(true);
    expect(editor.getRichMessage().input.blocks).toEqual(blocks);

    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'opaqueRichBlock', attrs: {block: {_: 'pageBlockAnchor', name: ''}}},
        {type: 'opaqueRichBlock', attrs: {block: {_: 'pageBlockFooter', text: EMPTY_RICH_TEXT}}},
        {type: 'opaqueRichBlock', attrs: {block: {...map, h: 0}}},
        {type: 'opaqueRichBlock', attrs: {block: {_: 'pageBlockDivider'}}}
      ]
    })).toBe(true);
    expect(editor.getDocument().content?.[0]).toEqual({
      type: 'richAnchor',
      attrs: {name: ''}
    });
    expect(editor.getRichMessage().input.blocks).toEqual([{_: 'pageBlockDivider'}]);
  });

  test('authors editable footer, atomic divider, and updates all map fields losslessly', () => {
    const {editor, input} = mountEditor();
    expect(editor.insertFooter({
      text: 'Formatted footer',
      entities: [{_: 'messageEntityBold', offset: 0, length: 9}]
    })).toBe(true);
    expect(editor.insertDivider()).toBe(true);
    const divider = input.querySelector<HTMLElement>('[data-rich-divider]');
    expect(divider?.tagName).toBe('DIV');
    expect(divider?.classList.contains('chat-input-rich-divider')).toBe(true);
    expect(editor.insertMap({
      accuracyRadius: 8,
      caption: 'Dubai',
      captionEntities: [{_: 'messageEntityItalic', offset: 0, length: 5}],
      credit: 'OpenStreetMap',
      height: 360,
      latitude: 25.2048,
      longitude: 55.2708,
      width: 640,
      zoom: 12
    })).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    let mapPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'richMap') return;
      mapPosition = position;
      return false;
    });
    expect(mapPosition).toBeGreaterThanOrEqual(0);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mapPosition)
    ));

    expect(editor.getSelectedMap()).toMatchObject({
      accuracyRadius: 8,
      caption: 'Dubai',
      credit: 'OpenStreetMap',
      height: 360,
      latitude: 25.2048,
      longitude: 55.2708,
      width: 640,
      zoom: 12
    });
    expect(editor.updateSelectedMap({
      caption: 'New place',
      height: 512,
      latitude: 51.5074,
      longitude: -0.1278,
      width: 768,
      zoom: 14
    })).toBe(true);

    const blocks = editor.getRichMessage().input.blocks;
    expect(blocks[0]).toEqual({
      _: 'pageBlockFooter',
      text: {
        _: 'textConcat',
        texts: [
          {_: 'textBold', text: {_: 'textPlain', text: 'Formatted'}},
          {_: 'textPlain', text: ' footer'}
        ]
      }
    });
    expect(blocks[1]).toEqual({_: 'pageBlockDivider'});
    expect(blocks[2]).toMatchObject({
      _: 'inputPageBlockMap',
      geo: {
        _: 'inputGeoPoint',
        accuracy_radius: 8,
        lat: 51.5074,
        long: -0.1278
      },
      h: 512,
      w: 768,
      zoom: 14,
      caption: {
        text: {_: 'textPlain', text: 'New place'},
        credit: {_: 'textPlain', text: 'OpenStreetMap'}
      }
    });
    expect(input.querySelector('[data-rich-map]')?.textContent).toContain('New place');
    expect(input.querySelector('[data-rich-map]')?.textContent).toContain('OpenStreetMap');
    expect(editor.isEmpty()).toBe(false);

    expect(editor.updateSelectedMap({accuracyRadius: undefined})).toBe(true);
    const movedMap = editor.getRichMessage().input.blocks[2] as PageBlock.inputPageBlockMap;
    expect(movedMap.geo._).toBe('inputGeoPoint');
    expect((movedMap.geo as {accuracy_radius?: number}).accuracy_radius).toBeUndefined();
  });

  test('preserves quote captions and both visible and empty rich anchors', () => {
    const caption: RichText = {
      _: 'textBold',
      text: {_: 'textPlain', text: 'Source'}
    };
    const anchoredText: RichText = {
      _: 'textConcat',
      texts: [
        {
          _: 'textAnchor',
          text: {_: 'textPlain', text: 'Reference'},
          name: 'visible-reference'
        },
        {
          _: 'textAnchor',
          text: EMPTY_RICH_TEXT,
          name: 'empty-reference'
        }
      ]
    };
    const blocks: PageBlock[] = [
      {
        _: 'pageBlockBlockquote',
        pFlags: {},
        text: {_: 'textPlain', text: 'Quote'},
        caption
      },
      {_: 'pageBlockParagraph', text: anchoredText}
    ];
    const {editor, input} = mountEditor();

    expect(editor.setRichMessage(richMessage(blocks))).toBe(true);
    expect(input.querySelector('[data-blockquote-caption-content]')?.textContent).toBe('Source');
    const paragraph = editor.getDocument().content?.[1];
    expect(paragraph?.content?.[0].marks).toContainEqual({
      type: 'link',
      attrs: expect.objectContaining({richAnchorName: 'visible-reference'})
    });
    expect(paragraph?.content?.[1]).toEqual({
      type: 'inlineRichAnchor',
      attrs: {name: 'empty-reference'}
    });
    expect(editor.isEmpty()).toBe(false);
    expect(editor.getRichMessage().output.blocks).toEqual(blocks);

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.setTextSelection(2)).toBe(true);
    expect(editor.getBlockquoteCaption()).toBe('Source');
    expect(editor.setBlockquoteCaption('Edited source')).toBe(true);
    expect(input.querySelector('[data-blockquote-caption-content]')?.textContent).toBe('Edited source');
    expect((editor.getRichMessage().output.blocks[0] as PageBlock.pageBlockBlockquote).caption).toEqual({
      _: 'textPlain',
      text: 'Edited source'
    });

    const captionElement = input.querySelector<HTMLElement>('[data-blockquote-caption-content]');
    expect(captionElement?.closest('[data-chat-input-editor="tiptap"]')).toBe(input);
    let captionTextPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === 'Edited source') {
        captionTextPosition = position;
        return false;
      }
    });
    expect(captionTextPosition).toBeGreaterThan(0);
    editor.restoreSelection({
      from: captionTextPosition,
      to: captionTextPosition + 'Edited source'.length
    }, false);
    expect(editor.applyMarkup({type: 'bold'})).toBe(true);
    expect((editor.getRichMessage().output.blocks[0] as PageBlock.pageBlockBlockquote).caption).toEqual({
      _: 'textBold',
      text: {
        _: 'textPlain',
        text: 'Edited source'
      }
    });
  });

  test('keeps no-autolink in editor snapshots and exposes an explicit override', () => {
    const {editor} = mountEditor();
    expect(editor.setRichMessage(richMessage([{
      _: 'pageBlockParagraph',
      text: {_: 'textPlain', text: 'https://example.com'}
    }], {rtl: true}))).toBe(true);

    expect(editor.snapshot().richMessageOptions).toEqual({noAutolink: true, rtl: true});
    expect(editor.getRichMessage().input.pFlags).toEqual({noautolink: true});

    const restored = mountEditor(editor.snapshot()).editor;
    expect(restored.getRichMessage().input.pFlags.noautolink).toBe(true);
    restored.setNoAutolink(false);
    expect(restored.getRichMessage().input.pFlags.noautolink).toBeUndefined();
    restored.setNoAutolink(true);
    expect(restored.getRichMessage().input.pFlags.noautolink).toBe(true);
  });

  test('supports table titles and block math through public engine methods', () => {
    const {editor, input} = mountEditor();

    expect(editor.getTableTitle()).toBeUndefined();
    expect(editor.insertTable()).toBe(true);
    const wrapper = editor.getDocument().content?.[0];
    const title = wrapper?.content?.[0];
    const table = wrapper?.content?.[1];
    expect(wrapper?.type).toBe('chatTableWrapper');
    expect(title).toEqual({type: 'chatTableTitle'});
    expect(table?.type).toBe('table');
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.every((row) => row.content?.length === 3)).toBe(true);
    expect(table?.content?.[0].content?.[0].type).toBe('tableHeader');
    expect(editor.getTableTitle()).toBe('');
    expect(editor.toggleTableBordered()).toBe(true);
    expect(editor.toggleTableStriped()).toBe(true);
    expect(editor.toggleTableHeaderRow()).toBe(true);
    expect(editor.getDocument().content?.[0].content?.[1].attrs).toMatchObject({
      bordered: false,
      striped: true
    });
    expect(editor.getDocument().content?.[0].content?.[1].content?.[0].content?.[0].type)
    .toBe('tableCell');
    expect(editor.setTableTitle('Metrics')).toBe(true);
    expect(editor.getTableTitle()).toBe('Metrics');
    expect(editor.getDocument().content?.[0].content?.[0]).toEqual({
      type: 'chatTableTitle',
      content: [{type: 'text', text: 'Metrics'}]
    });
    expect(input.querySelector('[data-chat-input-table-title]')?.textContent).toBe('Metrics');
    const tiptap = (editor as TiptapEditorInternals).editor;
    let titlePosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'chatTableTitle') return;
      titlePosition = position;
      return false;
    });
    expect(titlePosition).toBeGreaterThanOrEqual(0);
    expect(tiptap.chain().setTextSelection({
      from: titlePosition + 1,
      to: titlePosition + 1 + 'Metrics'.length
    }).toggleBold().run()).toBe(true);
    expect(editor.getDocument().content?.[0].content?.[0].content?.[0].marks)
    .toEqual([{type: 'bold'}]);
    expect((editor.getRichMessage().output.blocks[0] as PageBlock.pageBlockTable).title)
    .toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'Metrics'}
    });

    editor.setTextWithEntities('');
    expect(editor.insertBlockMath('  ')).toBe(false);
    expect(editor.insertBlockMath('\\int_0^1 x^2 dx')).toBe(true);
    expect(editor.getDocument().content?.[0]).toEqual({
      type: 'blockMath',
      attrs: {source: '\\int_0^1 x^2 dx'}
    });
  });

  test('rejects non-paragraph table-cell blocks at document and transaction boundaries', () => {
    const {editor} = mountEditor();
    const invalid: JSONContent = {
      type: 'doc',
      content: [{
        type: 'chatTableWrapper',
        content: [
          {type: 'chatTableTitle'},
          {
            type: 'table',
            content: [{
              type: 'tableRow',
              content: [{
                type: 'tableCell',
                content: [{
                  type: 'heading',
                  attrs: {level: 2},
                  content: [{type: 'text', text: 'Not allowed'}]
                }]
              }]
            }]
          }
        ]
      }]
    };
    expect(editor.setDocument(invalid)).toBe(false);

    expect(editor.insertTable({columns: 1, rows: 1, withHeaderRow: false})).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const before = tiptap.state.doc.toJSON();
    const heading = tiptap.schema.nodes.heading.create(
      {level: 2},
      tiptap.schema.text('Not allowed')
    );
    const cell = tiptap.schema.nodes.tableCell.create(null, heading);
    const row = tiptap.schema.nodes.tableRow.create(null, cell);
    const table = tiptap.schema.nodes.table.create(null, row);
    const title = tiptap.schema.nodes.chatTableTitle.create();
    const wrapper = tiptap.schema.nodes.chatTableWrapper.create(null, [title, table]);
    tiptap.view.dispatch(
      tiptap.state.tr.replaceWith(0, tiptap.state.doc.content.size, wrapper)
    );

    expect(tiptap.state.doc.toJSON()).toEqual(before);
  });

  test('does not treat empty pullquotes, details, or task items as content', () => {
    const {editor} = mountEditor();
    const emptyDocuments: JSONContent[] = [
      {
        type: 'doc',
        content: [{
          type: 'pullquote',
          content: [{type: 'pullquoteText'}]
        }]
      },
      {
        type: 'doc',
        content: [{
          type: 'details',
          attrs: {open: false},
          content: [
            {type: 'detailsSummary'},
            {type: 'detailsBody', content: [{type: 'paragraph'}]}
          ]
        }]
      },
      {
        type: 'doc',
        content: [{
          type: 'taskList',
          content: [{
            type: 'taskItem',
            attrs: {checked: false},
            content: [{type: 'paragraph'}]
          }]
        }]
      }
    ];

    emptyDocuments.forEach((document) => {
      expect(editor.setDocument(document)).toBe(true);
      expect(editor.isEmpty()).toBe(true);
    });
  });
});
