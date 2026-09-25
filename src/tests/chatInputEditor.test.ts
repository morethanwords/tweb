import {useChatInputEditorHarness, TiptapEditorInternals, findEntity} from '@/tests/helpers/chatInputEditorHarness';
import createChatInputEditor from '@components/chat/inputEditor';
import reloadChatInputEditor from '@components/chat/inputEditor/reload';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import {createRichMediaPreviewUrl} from '@components/chat/inputEditor/mediaPreviewUrl';
import type {ChatInputEditorInputEvent} from '@components/chat/inputEditor/types';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import type {MessageEntity, PageBlock, Photo, RichMessage} from '@layer';

describe('Tiptap chat input editor: Core', () => {
  const {editors, mountEditor, mountInputFieldEditor, selectAllText} = useChatInputEditorHarness();

  test('mounts and registers on the same input element', () => {
    const parent = document.createElement('div');
    const input = document.createElement('div');
    parent.append(input);
    document.body.append(parent);

    const editor = createChatInputEditor(input);
    editors.push(editor);

    expect(editor.input).toBe(input);
    expect(parent.firstElementChild).toBe(input);
    expect(input.dataset.chatInputEditor).toBe('tiptap');
    expect(getChatInputEditor(input)).toBe(editor);
    expect(input.getAttribute('data-chat-input-editor')).toBe('tiptap');

    editor.destroy();
    expect(getChatInputEditor(input)).toBeUndefined();
    expect(input.dataset.chatInputEditor).toBeUndefined();
  });

  test('round-trips Telegram text and entities', () => {
    const {editor} = mountEditor();
    const text = 'bold spoiler link date\nquoted\nconst answer = 42;';
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 4},
      {_: 'messageEntitySpoiler', offset: 5, length: 7},
      {_: 'messageEntityTextUrl', offset: 13, length: 4, url: 'https://example.com'},
      {
        _: 'messageEntityFormattedDate',
        offset: 18,
        length: 4,
        date: 1784635200,
        pFlags: {long_date: true}
      },
      {_: 'messageEntityBlockquote', offset: 23, length: 6, pFlags: {collapsed: true}},
      {_: 'messageEntityPre', offset: 30, length: 18, language: 'js'}
    ];

    editor.setTextWithEntities(text, entities);

    expect(editor.getRichValue(false, false)).toEqual({value: text, entities: [], caretPos: -1});
    expect(editor.getRichValue(true, false)).toEqual({value: text, entities, caretPos: -1});
  });

  test('exposes a legacy media caption only for plain-compatible editor content', () => {
    const {editor} = mountEditor();
    const entities: MessageEntity[] = [{_: 'messageEntityBold', offset: 6, length: 4}];
    editor.setTextWithEntities('plain bold', entities);
    expect(editor.getLegacyValueIfLossless()).toEqual({value: 'plain bold', entities});

    editor.setTextWithEntities('- list item');
    expect(editor.getDocument().content?.[0].type).toBe('bulletList');
    expect(editor.getLegacyValueIfLossless()).toEqual({value: '- list item', entities: []});

    editor.setTextWithEntities('- [ ] pending');
    expect(editor.getDocument().content?.[0].type).toBe('taskList');
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();

    editor.setTextWithEntities('1. [ ] ordered pending');
    expect(editor.getDocument().content?.[0].type).toBe('orderedList');
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();

    const collapsedQuote: MessageEntity[] = [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 6,
      pFlags: {collapsed: true}
    }];
    editor.setTextWithEntities('Hidden', collapsedQuote);
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'blockquote',
      attrs: {collapsed: true}
    });
    expect(editor.getLegacyValueIfLossless()).toEqual({
      value: 'Hidden',
      entities: collapsedQuote
    });

    editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'First'},
          {type: 'hardBreak'},
          {type: 'text', text: 'Second'}
        ]
      }]
    });
    expect(editor.getMode()).toBe('plain');
    expect(editor.getLegacyValueIfLossless()).toEqual({
      value: 'First\nSecond',
      entities: []
    });

    editor.setDocument({
      type: 'doc',
      content: [{type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Heading'}]}]
    });
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();
  });

  test('keeps a quote of paragraphs collapsed in a rich message and sends it collapsed (layer 229)', () => {
    const {editor, input} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: {collapsed: true},
          content: [
            {type: 'paragraph', content: [{type: 'text', text: 'Hidden'}]},
            {type: 'paragraph', content: [{type: 'text', text: 'lines'}]}
          ]
        },
        {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Heading'}]}
      ]
    });

    expect(editor.getMode()).toBe('rich');
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'blockquote',
      attrs: {collapsed: true, rich: true}
    });
    expect(editor.getRichMessage().input.blocks[0]).toEqual({
      _: 'pageBlockBlockquote',
      pFlags: {collapsed: true},
      text: {_: 'textPlain', text: 'Hidden\nlines'},
      caption: {_: 'textEmpty'}
    });
    const quote = input.querySelector<HTMLElement>('[data-chat-input-blockquote]')!;
    expect(quote.querySelector('.input-collapsible-quote')).not.toBeNull();
    expect(editor.toggleBlockquoteCollapsed(quote)).toBe(true);
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockBlockquoteBlocks'
    });

    editor.setDocument({
      type: 'doc',
      content: [{
        type: 'blockquote',
        attrs: {collapsed: false},
        content: [{type: 'paragraph', content: [{type: 'text', text: 'Visible'}]}]
      }]
    });
    expect(editor.getMode()).toBe('plain');
  });

  test('unfolds a rich quote that holds other blocks: only a quote of paragraphs can be sent collapsed', () => {
    const {editor, input} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: {collapsed: true},
          content: [{
            type: 'bulletList',
            content: [{type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Item'}]}]}]
          }]
        },
        {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Heading'}]}
      ]
    });

    expect(editor.getMode()).toBe('rich');
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'blockquote',
      attrs: {collapsed: false, rich: true}
    });
    const quote = input.querySelector<HTMLElement>('[data-chat-input-blockquote]')!;
    expect(quote.querySelector('.input-collapsible-quote')).toBeNull();
    expect(editor.toggleBlockquoteCollapsed(quote)).toBe(false);
    // nor does it get the switch
    expect(quote.querySelector('.chat-input-quote-toggle')).toBeNull();
  });

  test('gives a foldable quote a real switch, which keeps its place and follows the quote', () => {
    const {editor, input} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [{
        type: 'blockquote',
        attrs: {collapsed: false},
        content: [{type: 'paragraph', content: [{type: 'text', text: 'Long quote'}]}]
      }]
    });

    const toggle = input.querySelector<HTMLButtonElement>('blockquote > .chat-input-quote-toggle')!;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-label')).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    // the button itself is what RichMessageInput hands over when it is pressed
    expect(editor.toggleBlockquoteCollapsed(toggle)).toBe(true);
    expect(editor.getDocument().content?.[0].attrs).toMatchObject({collapsed: true});
    // the same element, so a keyboard press does not lose the focus
    expect(input.querySelector('blockquote > .chat-input-quote-toggle')).toBe(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    // it is not part of what is sent
    expect(editor.getRichValue(true, false).value).toBe('Long quote');
  });

  test('switches quote representation with editor expansion and preserves authored quotes', () => {
    const {editor, input} = mountEditor();
    const quoteEntity: MessageEntity.messageEntityBlockquote = {
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {collapsed: true}
    };
    editor.setTextWithEntities('Quote', [quoteEntity]);

    expect(editor.getMode()).toBe('plain');
    expect(input.dataset.chatInputEditorMode).toBe('plain');
    expect(input.querySelector('[data-chat-input-blockquote-mode="rich"] [data-blockquote-caption-content]')).toBeNull();
    expect(editor.getLegacyValueIfLossless()).toEqual({
      value: 'Quote',
      entities: [quoteEntity]
    });

    editor.setExpanded(true);
    expect(editor.getMode()).toBe('rich');
    expect(input.dataset.chatInputEditorMode).toBe('rich');
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'blockquote',
      attrs: {collapsed: true, rich: true}
    });
    expect(input.querySelector('[data-blockquote-caption-content]')).not.toBeNull();
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();

    editor.setExpanded(false);
    expect(editor.getMode()).toBe('plain');
    expect(input.querySelector('[data-chat-input-blockquote-mode="rich"] [data-blockquote-caption-content]')).toBeNull();
    expect(editor.getLegacyValueIfLossless()).toEqual({
      value: 'Quote',
      entities: [quoteEntity]
    });

    editor.setExpanded(true);
    editor.restoreSelection({from: 2, to: 2}, false);
    expect(editor.setBlockquoteCaption('Author')).toBe(true);
    editor.setExpanded(false);
    expect(editor.getMode()).toBe('rich');
    expect(input.querySelector('[data-blockquote-caption-content]')?.textContent).toBe('Author');
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();

    editor.restoreSelection({from: 2, to: 2}, false);
    expect(editor.setBlockquoteCaption('')).toBe(true);
    expect(editor.getMode()).toBe('plain');
    expect(input.querySelector('[data-chat-input-blockquote-mode="rich"] [data-blockquote-caption-content]')).toBeNull();
  });

  test('switches modes immediately when rich-only formatting is added or removed', () => {
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('Quote', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {}
    }]);
    editor.restoreSelection({from: 2, to: 7}, false);

    expect(editor.applyMarkup({type: 'bold'})).toBe(true);
    expect(editor.getMode()).toBe('plain');
    expect(input.querySelector('[data-chat-input-blockquote-mode="rich"] [data-blockquote-caption-content]')).toBeNull();

    expect(editor.applyMarkup({type: 'subscript'})).toBe(true);
    expect(editor.getMode()).toBe('rich');
    expect(input.querySelector('[data-blockquote-caption-content]')).not.toBeNull();
    expect(editor.getDocument().content?.[0]?.attrs).toMatchObject({
      collapsed: false,
      rich: true
    });

    expect(editor.applyMarkup({type: 'subscript'})).toBe(true);
    expect(editor.getMode()).toBe('plain');
    expect(input.querySelector('[data-chat-input-blockquote-mode="rich"] [data-blockquote-caption-content]')).toBeNull();
  });

  test('emits a structural input event when expansion changes quote serialization', async() => {
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('Quote', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {}
    }]);
    await Promise.resolve();
    const events: ChatInputEditorInputEvent[] = [];
    input.addEventListener('input', (event) => {
      events.push(event as ChatInputEditorInputEvent);
    });

    editor.setExpanded(true);
    await Promise.resolve();
    expect(events).toHaveLength(1);
    expect(events[0].chatInputEditorStructuralChange).toBe(true);

    editor.setExpanded(false);
    await Promise.resolve();
    expect(events).toHaveLength(2);
    expect(events[1].chatInputEditorStructuralChange).toBe(true);
  });

  test('keeps native rich block and table metadata in the editor schema', () => {
    const {editor} = mountEditor();
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {rtl: true},
      blocks: [
        {_: 'pageBlockHeading6', text: {_: 'textPlain', text: 'Small heading'}},
        {_: 'pageBlockMath', source: 'x^2 + y^2'},
        {
          _: 'pageBlockTable',
          pFlags: {striped: true},
          title: {_: 'textBold', text: {_: 'textPlain', text: 'Data'}},
          rows: [{
            _: 'pageTableRow',
            cells: [{
              _: 'pageTableCell',
              pFlags: {align_right: true, valign_bottom: true},
              text: {_: 'textPlain', text: '42'}
            }]
          }]
        },
        {
          _: 'pageBlockOrderedList',
          pFlags: {reversed: true},
          start: 3,
          type: 'I',
          items: [{
            _: 'pageListOrderedItemText',
            pFlags: {checkbox: true},
            num: 'III',
            text: {_: 'textPlain', text: 'three'},
            value: 3,
            type: 'I'
          }]
        }
      ],
      photos: [],
      documents: []
    };

    expect(editor.setRichMessage(message)).toBe(true);
    const document = editor.getDocument();
    expect(document.content?.map((node) => node.type)).toEqual([
      'heading',
      'blockMath',
      'chatTableWrapper',
      'orderedList'
    ]);
    expect(document.content?.[0].attrs?.level).toBe(6);
    expect(document.content?.[1].attrs?.source).toBe('x^2 + y^2');
    expect(document.content?.[2].content?.[0]).toMatchObject({
      type: 'chatTableTitle',
      content: [{type: 'text', text: 'Data', marks: [{type: 'bold'}]}]
    });
    expect(document.content?.[2].content?.[1].attrs).toMatchObject({
      bordered: false,
      striped: true
    });
    expect(document.content?.[2].content?.[1].content?.[0].content?.[0].attrs).toMatchObject({
      align: 'right',
      verticalAlign: 'bottom'
    });
    expect(document.content?.[3].attrs).toMatchObject({start: 3, type: 'I', reversed: true});
    expect(document.content?.[3].content?.[0].attrs).toMatchObject({
      checkbox: true,
      checked: false,
      value: 3,
      type: 'I'
    });
    expect(document.content?.[3].content?.[0].attrs?.num).toBeNull();

    const roundTrip = editor.getRichMessage().output;
    expect(editor.isEmpty()).toBe(false);
    expect(roundTrip.pFlags.rtl).toBeUndefined();
    expect(roundTrip.blocks.map((block) => block._)).toEqual(message.blocks.map((block) => block._));
    const table = roundTrip.blocks[2] as PageBlock.pageBlockTable;
    expect(table.title).toEqual((message.blocks[2] as PageBlock.pageBlockTable).title);
    expect(table.rows[0].cells[0].pFlags).toMatchObject({
      align_right: true,
      valign_bottom: true
    });
  });

  test('keeps list number style distinct from the selected item marker', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: {type: 'I'},
        content: [{
          type: 'listItem',
          attrs: {num: 'a', type: 'a'},
          content: [{type: 'paragraph', content: [{type: 'text', text: 'First'}]}]
        }, {
          type: 'listItem',
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Second'}]}]
        }]
      }]
    })).toBe(true);

    const textPositions: number[] = [];
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'text') textPositions.push(position);
    });
    editor.restoreSelection({from: textPositions[1], to: textPositions[1]}, false);

    expect(editor.setOrderedListType('A')).toBe(true);
    let list = editor.getDocument().content?.[0];
    expect(list?.attrs?.type).toBe('A');
    expect(list?.content?.map((item) => ({
      num: item.attrs?.num,
      type: item.attrs?.type
    }))).toEqual([
      {num: null, type: null},
      {num: null, type: null}
    ]);

    expect(editor.setOrderedListItemType('i')).toBe(true);
    list = editor.getDocument().content?.[0];
    expect(list?.content?.map((item) => item.attrs?.type)).toEqual([null, 'i']);
    const items = input.querySelectorAll('ol > li');
    expect(items[0].getAttribute('data-list-item-type')).toBeNull();
    expect(items[1].getAttribute('data-list-item-type')).toBe('i');
    expect(items[1].getAttribute('style')).toContain('lower-roman');

    expect(editor.setOrderedListItemType('A')).toBe(true);
    list = editor.getDocument().content?.[0];
    expect(list?.content?.map((item) => item.attrs?.type)).toEqual([null, null]);
  });

  test('hides the main placeholder after restoring a rich draft', () => {
    const {editor, inputField} = mountInputFieldEditor();
    expect(inputField.placeholder.classList.contains('is-empty')).toBe(true);

    expect(editor.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockHeading1',
        text: {_: 'textPlain', text: 'Restored draft'}
      }],
      photos: [],
      documents: []
    })).toBe(true);
    inputField.syncFromInput();

    expect(inputField.input.classList.contains('is-empty')).toBe(false);
    expect(inputField.placeholder.classList.contains('is-empty')).toBe(false);
  });

  test('exposes structural toolbar commands with undo and redo history', () => {
    const {editor} = mountEditor();

    editor.setTextWithEntities('item');
    expect(editor.canUndo()).toBe(false);
    expect(editor.toggleBulletList()).toBe(true);
    expect(editor.getDocument().content?.[0].type).toBe('bulletList');
    expect(editor.canUndo()).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument().content?.[0].type).toBe('paragraph');
    expect(editor.canRedo()).toBe(true);
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument().content?.[0].type).toBe('bulletList');

    expect(editor.toggleOrderedList()).toBe(true);
    expect(editor.getDocument().content?.[0].type).toBe('orderedList');

    editor.setTextWithEntities('const answer = 42;');
    expect(editor.toggleCodeBlock()).toBe(true);
    expect(editor.getDocument().content?.[0].type).toBe('codeBlock');

    editor.setTextWithEntities('x^2');
    selectAllText(editor, 3);
    expect(editor.getSelectedText()).toBe('x^2');
    expect(editor.insertInlineMath('x^2')).toBe(true);
    expect(editor.getDocument().content?.[0].content).toEqual([{
      type: 'inlineMath',
      attrs: {source: 'x^2'}
    }]);
    expect(editor.insertInlineMath('  ')).toBe(false);
  });

  test('keeps a local media preview alive across editor hot reload', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hot-reload-media');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const {editor} = mountEditor();
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo: {_: 'photo', id: '1', access_hash: '2', file_reference: new Uint8Array([1])} as Photo.photo,
      previewUrl: preview.url
    }])).toBe(true);
    preview.release();
    const before = editor.getDocument();

    const restored = reloadChatInputEditor(editor, createChatInputEditor, {});
    editors.push(restored);
    expect(revoke).not.toHaveBeenCalledWith(preview.url);
    expect(restored.getDocument()).toEqual(before);
    restored.destroy();
    expect(revoke).toHaveBeenCalledWith(preview.url);
  });

  test('restores a snapshot on the same input element for HMR', () => {
    const input = document.createElement('div');
    document.body.append(input);
    const original = createChatInputEditor(input);
    original.setTextWithEntities('hot reload', [{_: 'messageEntitySpoiler', offset: 4, length: 6}]);
    original.restoreSelection({from: 5, to: 11}, false);
    original.setEditable(false);
    const snapshot = original.snapshot();
    expect(input.classList.contains('tiptap')).toBe(true);
    original.destroy();
    expect(input.classList.contains('tiptap')).toBe(false);

    const restored = createChatInputEditor(input, {}, snapshot);
    editors.push(restored);

    expect(restored.input).toBe(input);
    expect(input.className.match(/\btiptap\b/g)).toHaveLength(1);
    expect(getChatInputEditor(input)).toBe(restored);
    expect(restored.getRichValue(true, false)).toEqual({
      value: 'hot reload',
      entities: [{_: 'messageEntitySpoiler', offset: 4, length: 6}],
      caretPos: -1
    });
    expect(restored.captureSelection()).toEqual(snapshot.selection);
    expect(restored.snapshot().editable).toBe(false);
  });

  test('updates editability without replacing the mounted input', () => {
    const {editor, input} = mountEditor();

    editor.setEditable(false);
    expect(editor.input).toBe(input);
    expect(editor.snapshot().editable).toBe(false);
    expect(input.getAttribute('contenteditable')).toBe('false');

    editor.setEditable(true);
    expect(editor.snapshot().editable).toBe(true);
    expect(input.getAttribute('contenteditable')).toBe('true');
  });

  test('routes getRichValueWithCaret and applyMarkdown through the registered editor', async() => {
    const {applyMarkdown} = await import('@helpers/dom/markdown');
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('route');
    selectAllText(editor, 5);
    const getRichValue = vi.spyOn(editor, 'getRichValue');
    const applyMarkup = vi.spyOn(editor, 'applyMarkup');

    expect(getRichValueWithCaret(input, true, false)).toEqual({
      value: 'route',
      entities: [],
      caretPos: -1
    });
    expect(getRichValue).toHaveBeenCalledWith(true, false);

    expect(applyMarkdown({input, type: 'bold'})).toBe(true);
    expect(applyMarkup).toHaveBeenCalledWith({type: 'bold', href: undefined, dateSuffix: undefined});
    expect(findEntity(editor.getRichValue().entities, 'messageEntityBold')).toMatchObject({offset: 0, length: 5});
  });
});
