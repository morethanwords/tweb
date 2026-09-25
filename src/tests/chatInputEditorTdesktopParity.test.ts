import type {Editor, JSONContent} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import '@/tests/mocks/chatInputEditorNodes';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {
  ChatInputEditor,
  ChatInputEditorSelection
} from '@components/chat/inputEditor/types';
import type {MessageEntity, PageBlock, RichMessage} from '@layer';

function findNodePosition(editor: Editor, type: string) {
  let found = -1;
  editor.state.doc.descendants((node, position) => {
    if(node.type.name !== type) return;
    found = position;
    return false;
  });
  return found;
}

function logicalDocumentContent(editor: ChatInputEditor) {
  const content = editor.getDocument().content || [];
  const last = content[content.length - 1];
  return last?.type === 'paragraph' && !last.content ? content.slice(0, -1) : content;
}

describe('chat input editor tdesktop parity', () => {
  const editors: ChatInputEditor[] = [];

  function mountEditor(options: Parameters<typeof mountChatInputEditor>[0] = {}) {
    const mounted = mountChatInputEditor(options);
    editors.push(mounted.editor);
    return mounted;
  }

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.replaceChildren();
  });

  test('expands a collapsed link selection and routes Mod+K through one callback', () => {
    const onLinkEditor = vi.fn<(selection: ChatInputEditorSelection) => void>();
    const {editor, input, tiptap} = mountEditor({onLinkEditor});
    const entity: MessageEntity.messageEntityTextUrl = {
      _: 'messageEntityTextUrl',
      length: 7,
      offset: 7,
      url: 'https://example.com'
    };
    editor.setTextWithEntities('Before example after', [entity]);
    editor.restoreSelection({from: 10, to: 10}, false);

    expect(editor.getSelectedLink()).toEqual({
      from: 8,
      text: 'example',
      to: 15,
      url: 'https://example.com'
    });

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyK',
      key: 'k',
      metaKey: true
    }));
    expect(onLinkEditor).toHaveBeenCalledOnce();
    expect(onLinkEditor).toHaveBeenCalledWith({from: 10, to: 10});
    expect(tiptap.state.selection.empty).toBe(true);
  });

  test('edits an active link without shifting the replaced text range', () => {
    const {editor} = mountEditor();
    const entity: MessageEntity.messageEntityTextUrl = {
      _: 'messageEntityTextUrl',
      length: 7,
      offset: 7,
      url: 'https://example.com'
    };
    editor.setTextWithEntities('Before example after', [entity]);
    editor.restoreSelection({from: 10, to: 10}, false);
    const selected = editor.getSelectedLink();
    expect(selected).toBeDefined();

    const replacement = 'renamed';
    expect(editor.replaceDocumentRange(
      selected.from,
      selected.to,
      replacement,
      [{
        _: 'messageEntityTextUrl',
        length: replacement.length,
        offset: 0,
        url: 'https://telegram.org'
      }]
    )).toBe(true);
    expect(editor.getRichValue()).toMatchObject({
      value: 'Before renamed after',
      entities: [{
        _: 'messageEntityTextUrl',
        length: replacement.length,
        offset: 7,
        url: 'https://telegram.org'
      }]
    });
  });

  test('updates only the link mark when its displayed rich text is unchanged', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Before example after', [{
      _: 'messageEntityBold',
      length: 7,
      offset: 7
    }, {
      _: 'messageEntityTextUrl',
      length: 7,
      offset: 7,
      url: 'https://example.com'
    }]);
    editor.restoreSelection({from: 10, to: 10}, false);
    const selected = editor.getSelectedLink();
    expect(selected).toBeDefined();

    expect(editor.updateLinkRange(
      selected.from,
      selected.to,
      'https://telegram.org'
    )).toBe(true);
    const value = editor.getRichValue();
    expect(value.value).toBe('Before example after');
    expect(value.entities).toEqual(expect.arrayContaining([{
      _: 'messageEntityBold',
      length: 7,
      offset: 7
    }, {
      _: 'messageEntityTextUrl',
      length: 7,
      offset: 7,
      url: 'https://telegram.org'
    }]));
  });

  test('preserves surrounding paragraphs through math conversion and undo/redo', () => {
    const {editor, tiptap} = mountEditor();
    const document: JSONContent = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'Before '},
          {type: 'inlineMath', attrs: {source: 'x'}},
          {type: 'text', text: ' after'}
        ]
      }]
    };
    expect(editor.setDocument(document)).toBe(true);
    let mathPosition = findNodePosition(tiptap, 'inlineMath');
    expect(mathPosition).toBeGreaterThan(0);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mathPosition)
    ));

    expect(editor.insertBlockMath('x^2')).toBe(true);
    const blockDocument = editor.getDocument();
    expect(logicalDocumentContent(editor)).toEqual([
      {
        type: 'paragraph',
        content: [{type: 'text', text: 'Before '}]
      },
      {
        type: 'blockMath',
        attrs: {source: 'x^2'}
      },
      {
        type: 'paragraph',
        content: [{type: 'text', text: ' after'}]
      }
    ]);

    mathPosition = findNodePosition(tiptap, 'blockMath');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mathPosition)
    ));
    expect(editor.insertInlineMath('y')).toBe(true);
    const inlineDocument = editor.getDocument();
    expect(logicalDocumentContent(editor)).toEqual([
      {type: 'paragraph', content: [{type: 'text', text: 'Before '}]},
      {type: 'paragraph', content: [{type: 'inlineMath', attrs: {source: 'y'}}]},
      {type: 'paragraph', content: [{type: 'text', text: ' after'}]}
    ]);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect((tiptap.state.selection as NodeSelection).node.type.name).toBe('inlineMath');

    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(blockDocument);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(document);
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(blockDocument);
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(inlineDocument);
  });

  test('keeps incompatible neighboring block types when converting math inline', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: {level: 2},
        content: [{type: 'text', text: 'Heading'}]
      }, {
        type: 'blockMath',
        attrs: {source: 'x'}
      }, {
        type: 'richFooter',
        content: [{type: 'text', text: 'Footer'}]
      }]
    })).toBe(true);
    const mathPosition = findNodePosition(tiptap, 'blockMath');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mathPosition)
    ));

    expect(editor.insertInlineMath('y')).toBe(true);
    expect(logicalDocumentContent(editor)).toEqual([{
      type: 'heading',
      attrs: {level: 2},
      content: [{type: 'text', text: 'Heading'}]
    }, {
      type: 'paragraph',
      content: [{type: 'inlineMath', attrs: {source: 'y'}}]
    }, {
      type: 'richFooter',
      content: [{type: 'text', text: 'Footer'}]
    }]);
  });

  test('keeps list-item content valid when separating math at paragraph start', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [
              {type: 'inlineMath', attrs: {source: 'x'}},
              {type: 'text', text: ' after'}
            ]
          }]
        }]
      }]
    })).toBe(true);
    const mathPosition = findNodePosition(tiptap, 'inlineMath');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mathPosition)
    ));

    expect(editor.canUseSeparateLineMath()).toBe(true);
    expect(editor.insertBlockMath('x^2')).toBe(true);
    expect(editor.getDocument().content?.[0]?.content?.[0]?.content).toEqual([{
      type: 'paragraph'
    }, {
      type: 'blockMath',
      attrs: {source: 'x^2'}
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: ' after'}]
    }]);
  });

  test('disables separate-line math on heading surfaces', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: {level: 2},
        content: [
          {type: 'text', text: 'Before '},
          {type: 'inlineMath', attrs: {source: 'x'}}
        ]
      }]
    })).toBe(true);
    const mathPosition = findNodePosition(tiptap, 'inlineMath');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, mathPosition)
    ));
    const before = editor.getDocument();

    expect(editor.canUseSeparateLineMath()).toBe(false);
    expect(editor.insertBlockMath('x^2')).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  test('edits ordered-list and item marker styles without losing imported numbering', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: {
          reversed: true,
          start: 4,
          type: 'I'
        },
        content: [{
          type: 'listItem',
          attrs: {type: 'a', value: 9},
          content: [{
            type: 'paragraph',
            content: [{type: 'text', text: 'Item'}]
          }]
        }]
      }]
    })).toBe(true);
    const textPosition = findNodePosition(tiptap, 'text');
    editor.restoreSelection({from: textPosition, to: textPosition}, false);

    expect(editor.getOrderedListState()).toEqual({
      itemType: 'a',
      itemValue: 9,
      reversed: true,
      start: 4,
      type: 'I'
    });
    expect(editor.setOrderedListType()).toBe(true);
    expect(editor.setOrderedListItemType('A')).toBe(true);
    expect(editor.toggleOrderedListReversed()).toBe(true);
    expect(editor.getOrderedListState()).toMatchObject({
      itemType: 'A',
      itemValue: 9,
      reversed: false,
      start: 4,
      type: undefined
    });
  });

  test('clears incompatible marker metadata when changing the list kind', () => {
    const {editor, tiptap} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: {reversed: true, start: 4, type: 'I'},
        content: [{
          type: 'listItem',
          attrs: {
            checkbox: true,
            checked: true,
            type: 'a',
            value: 9
          },
          content: [{
            type: 'paragraph',
            content: [{type: 'text', text: 'Item'}]
          }]
        }]
      }]
    })).toBe(true);
    const textPosition = findNodePosition(tiptap, 'text');
    editor.restoreSelection({from: textPosition, to: textPosition}, false);

    expect(editor.toggleBulletList()).toBe(true);
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'bulletList',
      content: [{
        type: 'listItem',
        attrs: {
          checkbox: null,
          checked: null,
          type: null,
          value: null
        }
      }]
    });
  });

  test('uses item count for an implicit reversed-list start without serializing it', () => {
    const {editor, input, tiptap} = mountEditor();
    const item = (text: string) => ({
      _: 'pageListOrderedItemText' as const,
      pFlags: {},
      text: {_: 'textPlain' as const, text}
    });
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockOrderedList',
        pFlags: {reversed: true},
        items: [item('Three'), item('Two'), item('One')]
      }],
      documents: [],
      photos: []
    };
    expect(editor.setRichMessage(message)).toBe(true);
    expect(editor.getDocument().content?.[0]?.attrs).toMatchObject({
      reversed: true,
      start: 3,
      startExplicit: false
    });
    const list = input.querySelector('ol');
    expect(list?.reversed).toBe(true);
    expect(list?.start).toBe(3);
    expect(list?.dataset.listStartExplicit).toBe('false');
    const output = editor.getRichMessage().output.blocks[0] as
      PageBlock.pageBlockOrderedList;
    expect(output.start).toBeUndefined();

    const textPosition = findNodePosition(tiptap, 'text');
    editor.restoreSelection({from: textPosition, to: textPosition}, false);
    expect(editor.toggleOrderedListReversed()).toBe(true);
    expect(editor.getDocument().content?.[0]?.attrs).toMatchObject({
      reversed: false,
      start: 1,
      startExplicit: false
    });
    expect(editor.toggleOrderedListReversed()).toBe(true);
    expect(editor.getDocument().content?.[0]?.attrs).toMatchObject({
      reversed: true,
      start: 3,
      startExplicit: false
    });
  });

  test('preserves implicit reversed-list starts through editor HTML and parses external attribute presence', () => {
    const {editor, tiptap} = mountEditor();
    const content = [{
      type: 'listItem',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'Three'}]}]
    }, {
      type: 'listItem',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'Two'}]}]
    }, {
      type: 'listItem',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'One'}]}]
    }];
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: {reversed: true, start: 3, startExplicit: false},
        content
      }]
    })).toBe(true);

    const generatedHtml = tiptap.getHTML();
    expect(generatedHtml).toContain('data-list-start-explicit="false"');
    expect(generatedHtml).toContain('start="3"');

    const {tiptap: restored} = mountEditor();
    expect(restored.commands.setContent(generatedHtml)).toBe(true);
    expect(restored.getJSON().content?.[0].attrs).toMatchObject({
      reversed: true,
      start: 3,
      startExplicit: false
    });

    expect(restored.commands.setContent(
      '<ol reversed><li><p>Three</p></li><li><p>Two</p></li><li><p>One</p></li></ol>'
    )).toBe(true);
    expect(restored.getJSON().content?.[0].attrs).toMatchObject({
      reversed: true,
      start: 3,
      startExplicit: false
    });

    expect(restored.commands.setContent(
      '<ol reversed start="3"><li><p>Three</p></li><li><p>Two</p></li><li><p>One</p></li></ol>'
    )).toBe(true);
    expect(restored.getJSON().content?.[0].attrs).toMatchObject({
      reversed: true,
      start: 3,
      startExplicit: true
    });
  });

  test('renders protocol ordered-list aliases while preserving their values', () => {
    const {editor, input} = mountEditor();
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockOrderedList',
        pFlags: {},
        type: 'upper-roman',
        items: [{
          _: 'pageListOrderedItemText',
          pFlags: {},
          text: {_: 'textPlain', text: 'First'}
        }, {
          _: 'pageListOrderedItemText',
          pFlags: {},
          text: {_: 'textPlain', text: 'Second'},
          type: 'lower-latin'
        }]
      }],
      documents: [],
      photos: []
    };
    expect(editor.setRichMessage(message)).toBe(true);
    const list = input.querySelector('ol');
    const items = input.querySelectorAll('li');
    expect(list?.style.listStyleType).toBe('upper-roman');
    expect(items[1]?.style.listStyleType).toBe('lower-alpha');

    const output = editor.getRichMessage().output.blocks[0] as
      PageBlock.pageBlockOrderedList;
    expect(output.type).toBe('upper-roman');
    expect(output.items[1].type).toBe('lower-latin');
  });

  test('routes the tdesktop block shortcuts through structural editor commands', () => {
    const {editor, input, tiptap} = mountEditor();
    Object.defineProperty(tiptap.view, 'scrollToSelection', {
      configurable: true,
      value: vi.fn()
    });
    editor.setTextWithEntities('Body');
    editor.focusAtEnd(false);
    const shortcut = (code: string, shiftKey = false, altKey = false) => {
      const event = new KeyboardEvent('keydown', {
        altKey,
        bubbles: true,
        cancelable: true,
        code,
        key: code.slice(3),
        metaKey: true,
        shiftKey
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };

    shortcut('Digit1', false, true);
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: {level: 1}
    });
    shortcut('KeyB', true);
    expect(editor.getDocument().content?.[0]?.type).toBe('paragraph');

    shortcut('KeyH', true);
    expect(editor.getDocument().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: {level: 2}
    });
    shortcut('KeyM');
    expect(editor.getDocument().content?.[0]?.type).toBe('codeBlock');
    shortcut('KeyM');
    expect(editor.getDocument().content?.[0]?.type).toBe('paragraph');

    shortcut('KeyT', true);
    expect(editor.getDocument().content?.some((node) => (
      node.type === 'chatTableWrapper' &&
      node.content?.[0]?.type === 'chatTableTitle' &&
      node.content?.[1]?.type === 'table'
    ))).toBe(true);
  });
});
