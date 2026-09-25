import {
  useChatInputEditorHarness,
  TiptapEditorInternals
} from '@/tests/helpers/chatInputEditorHarness';
import {AllSelection, NodeSelection, TextSelection} from '@tiptap/pm/state';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';

describe('Tiptap chat input editor: CustomEmoji', () => {
  const {customEmojiRenderingMocks, mountEditor} = useChatInputEditorHarness();

  test('renders a custom emoji through the shared input renderer without changing copy semantics', async() => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('AB');
    editor.restoreSelection({from: 2, to: 2}, false);

    expect(editor.replaceSelection('🥳', [{
      _: 'messageEntityCustomEmoji',
      document_id: '123456789',
      offset: 0,
      length: 2
    }])).toBe(true);

    expect(editor.getRichValue(true, false)).toEqual({
      value: 'A🥳B',
      entities: [{
        _: 'messageEntityCustomEmoji',
        document_id: '123456789',
        offset: 1,
        length: 2
      }],
      caretPos: -1
    });
    const customEmoji = editor.input.querySelector<HTMLElement>('[data-doc-id="123456789"]');
    expect(customEmoji?.dataset.stickerEmoji).toBe('🥳');
    expect(customEmoji?.textContent).toBe('');
    expect(customEmoji).toBeInstanceOf(HTMLImageElement);
    expect((customEmoji as HTMLImageElement).draggable).toBe(false);
    expect(customEmojiRenderingMocks.createRenderer).toHaveBeenCalledWith({
      wrappingDraft: true,
      isSelectable: true,
      textColor: 'primary-text-color',
      animationGroup: undefined
    });

    await Promise.resolve();
    const renderer = customEmojiRenderingMocks.renderers[0];
    const renderedElement = customEmojiRenderingMocks.elements[0];
    expect(editor.input.contains(renderer)).toBe(false);
    expect(editor.input.previousElementSibling).toBe(renderer);
    expect(renderer.add).toHaveBeenCalledOnce();
    expect(renderedElement.placeholder).toBe(customEmoji);

    expect(editor.getRichValue(false, false).value).toBe('A🥳B');

    const copied = document.createDocumentFragment();
    copied.append(customEmoji.cloneNode(true));
    expect(getRichValueWithCaret(copied, true, false)).toEqual({
      value: '🥳',
      entities: [{
        _: 'messageEntityCustomEmoji',
        document_id: '123456789',
        offset: 0,
        length: 2
      }],
      caretPos: -1
    });

    editor.setTextWithEntities('plain');
    expect(renderedElement.destroy).toHaveBeenCalledOnce();
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(renderer.isConnected).toBe(false);
  });

  test('models a custom emoji as one non-selectable text-like atom', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A🥳B', [{
      _: 'messageEntityCustomEmoji',
      document_id: '123456789',
      offset: 1,
      length: 2
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const customEmoji = tiptap.state.doc.nodeAt(2);

    expect(customEmoji?.type.name).toBe('customEmoji');
    expect(customEmoji?.nodeSize).toBe(1);
    expect(customEmoji?.isAtom).toBe(true);
    expect(NodeSelection.isSelectable(customEmoji)).toBe(false);

    const customEmojiElement = editor.input.querySelector<HTMLElement>('[data-doc-id="123456789"]');
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 2, 3))
    );
    expect(customEmojiElement.classList.contains('chat-input-custom-emoji-selected')).toBe(true);

    const serializeClipboard = tiptap.view.someProp('clipboardTextSerializer');
    expect(serializeClipboard?.(tiptap.state.selection.content(), tiptap.view)).toBe('🥳');

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 3))
    );
    expect(customEmojiElement.classList.contains('chat-input-custom-emoji-selected')).toBe(false);
  });

  test('places the caret on the clicked side of a custom emoji', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A🥳B', [{
      _: 'messageEntityCustomEmoji',
      document_id: '123456789',
      offset: 1,
      length: 2
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const customEmoji = tiptap.state.doc.nodeAt(2);
    const handleClickOn = tiptap.view.someProp('handleClickOn');

    expect(handleClickOn?.(
      tiptap.view,
      2,
      customEmoji,
      2,
      new MouseEvent('click', {button: 0}),
      true
    )).toBe(true);
    expect(tiptap.state.selection).toEqual(TextSelection.create(tiptap.state.doc, 2));

    expect(handleClickOn?.(
      tiptap.view,
      3,
      customEmoji,
      2,
      new MouseEvent('click', {button: 0}),
      true
    )).toBe(true);
    expect(tiptap.state.selection).toEqual(TextSelection.create(tiptap.state.doc, 3));
  });

  test('starts a drag selection directly on a custom emoji', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A🥳BC', [{
      _: 'messageEntityCustomEmoji',
      document_id: '123456789',
      offset: 1,
      length: 2
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const customEmoji = editor.input.querySelector<HTMLElement>('[data-doc-id="123456789"]');
    vi.spyOn(tiptap.view, 'posAtCoords')
    .mockReturnValue({inside: -1, pos: 4})
    .mockReturnValueOnce({inside: 2, pos: 2});
    const handleDOMEvents = tiptap.view.someProp('handleDOMEvents');
    const mousedown = new MouseEvent('mousedown', {
      button: 0,
      clientX: 10,
      clientY: 10
    });
    Object.defineProperty(mousedown, 'target', {value: customEmoji});

    handleDOMEvents.mousedown(tiptap.view, mousedown);
    expect(window.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      buttons: 1,
      cancelable: true,
      clientX: 30,
      clientY: 10
    }))).toBe(false);

    expect(tiptap.state.selection).toEqual(TextSelection.create(tiptap.state.doc, 2, 4));
    expect(customEmoji.classList.contains('chat-input-custom-emoji-selected')).toBe(true);

    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 30,
      clientY: 10
    }));
    expect(editor.getRichValue(false, false).value).toBe('A🥳BC');
  });

  test('extends a mouse selection through a custom emoji', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A🥳B', [{
      _: 'messageEntityCustomEmoji',
      document_id: '123456789',
      offset: 1,
      length: 2
    }]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const customEmoji = editor.input.querySelector<HTMLElement>('[data-doc-id="123456789"]');
    vi.spyOn(tiptap.view, 'posAtCoords').mockReturnValue({inside: 2, pos: 3});
    const handleDOMEvents = tiptap.view.someProp('handleDOMEvents');
    const shiftClick = () => {
      const mousedown = new MouseEvent('mousedown', {
        button: 0,
        clientX: 19,
        shiftKey: true
      });
      const mouseup = new MouseEvent('mouseup', {
        button: 0,
        clientX: 19,
        shiftKey: true
      });
      const click = new MouseEvent('click', {
        button: 0,
        clientX: 19,
        shiftKey: true
      });
      Object.defineProperty(mousedown, 'target', {value: customEmoji});
      Object.defineProperty(click, 'target', {value: customEmoji});
      handleDOMEvents.mousedown(tiptap.view, mousedown);
      window.dispatchEvent(mouseup);
      handleDOMEvents.click(tiptap.view, click as PointerEvent);
    };
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 2))
    );

    shiftClick();

    expect(tiptap.state.selection).toEqual(TextSelection.create(tiptap.state.doc, 2, 3));
    expect(customEmoji.classList.contains('chat-input-custom-emoji-selected')).toBe(true);

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc))
    );
    shiftClick();
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.from).toBeGreaterThan(0);
  });
});
