import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  tableDocument,
  currentTable,
  typeTextThroughEditorView
} from '@/tests/helpers/chatInputEditorHarness';
import {AllSelection, Selection, TextSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import createChatInputEditor from '@components/chat/inputEditor';
import isInputEmpty, {isInputPlaceholderEmpty} from '@helpers/dom/isInputEmpty';
import {isNewLineShortcutPressed} from '@helpers/dom/isSendShortcutPressed';
import {setAppSettingsSilent} from '@stores/appSettings';

describe('Tiptap chat input editor: Keyboard', () => {
  const {editors, mountEditor, mountInputFieldEditor, expectSingleTerminalParagraph, logicalContent, logicalTopLevelText} = useChatInputEditorHarness();

  test('keeps exactly one empty terminal paragraph after every document mutation', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;

    expectSingleTerminalParagraph(input, tiptap);

    editor.setTextWithEntities('Body');
    expect(tiptap.state.doc.childCount).toBe(2);
    expect(tiptap.state.doc.firstChild?.textContent).toBe('Body');
    expectSingleTerminalParagraph(input, tiptap);

    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Body'}]},
        {type: 'paragraph'},
        {type: 'paragraph'}
      ]
    })).toBe(true);
    expect(tiptap.state.doc.childCount).toBe(4);
    expect(logicalContent(tiptap)).toHaveLength(3);
    expectSingleTerminalParagraph(input, tiptap);

    expect(tiptap.commands.setContent(tableDocument([['A', 'B'], ['C', 'D']]))).toBe(true);
    expect(tiptap.state.doc.childCount).toBe(2);
    expect(tiptap.state.doc.firstChild?.type.name).toBe('chatTableWrapper');
    expectSingleTerminalParagraph(input, tiptap);

    tiptap.view.dispatch(tiptap.state.tr.delete(0, tiptap.state.doc.content.size));
    expect(tiptap.state.doc.childCount).toBe(1);
    expectSingleTerminalParagraph(input, tiptap);
  });

  test('creates a new terminal paragraph as soon as the current sentinel receives text', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('Body');

    const sentinel = expectSingleTerminalParagraph(input, tiptap);
    editor.restoreSelection({
      from: sentinel.position + 1,
      to: sentinel.position + 1
    }, false);
    typeTextThroughEditorView(tiptap, 'X');

    expect(tiptap.state.doc.childCount).toBe(3);
    expect(tiptap.state.doc.child(1).textContent).toBe('X');
    expect(tiptap.state.selection.$from.index(0)).toBe(1);
    expectSingleTerminalParagraph(input, tiptap);

    expect(editor.undo()).toBe(true);
    expect(tiptap.state.doc.childCount).toBe(2);
    expect(logicalTopLevelText(tiptap)).toEqual(['Body']);
    expectSingleTerminalParagraph(input, tiptap);

    expect(editor.redo()).toBe(true);
    expect(tiptap.state.doc.childCount).toBe(3);
    expect(logicalTopLevelText(tiptap)).toEqual(['Body', 'X']);
    expectSingleTerminalParagraph(input, tiptap);

    typeTextThroughEditorView(tiptap, 'Y');
    expect(tiptap.state.doc.childCount).toBe(3);
    expect(tiptap.state.doc.child(1).textContent).toBe('XY');
    expectSingleTerminalParagraph(input, tiptap);
  });

  test.each([false, true])(
    'inserts one newline from the terminal placeholder with shiftKey=%s',
    (shiftKey) => {
      const {editor, input} = mountEditor(undefined, {
        isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey === shiftKey
      });
      const tiptap = (editor as TiptapEditorInternals).editor;
      editor.setDocument({
        type: 'doc',
        content: [{
          type: 'heading',
          attrs: {level: 1},
          content: [{type: 'text', text: 'Heading'}]
        }]
      });
      const sentinel = expectSingleTerminalParagraph(input, tiptap);
      editor.restoreSelection({
        from: sentinel.position + 1,
        to: sentinel.position + 1
      }, false);

      for(let count = 1; count <= 3; ++count) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          shiftKey
        }));

        expect(editor.getRichValue(false, false).value).toBe(`Heading${'\n'.repeat(count)}`);
        expect(tiptap.state.doc.childCount).toBe(2 + count);
        expect(tiptap.state.selection.$from.parent).toBe(tiptap.state.doc.lastChild);
        expectSingleTerminalParagraph(input, tiptap);
      }

      for(let count = 2; count >= 0; --count) {
        expect(editor.undo()).toBe(true);
        expect(editor.getRichValue(false, false).value).toBe(`Heading${'\n'.repeat(count)}`);
        expectSingleTerminalParagraph(input, tiptap);
      }
      for(let count = 1; count <= 3; ++count) {
        expect(editor.redo()).toBe(true);
        expect(editor.getRichValue(false, false).value).toBe(`Heading${'\n'.repeat(count)}`);
        expectSingleTerminalParagraph(input, tiptap);
      }

      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Backspace'
      }));
      expect(editor.getRichValue(false, false).value).toBe('Heading\n\n');
      expectSingleTerminalParagraph(input, tiptap);
    }
  );

  test('excludes the terminal paragraph from text, rich-message, and clipboard serialization', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('Body');
    expectSingleTerminalParagraph(input, tiptap);

    expect(editor.getRichValue(true, false)).toEqual({
      value: 'Body',
      entities: [],
      caretPos: -1
    });
    const rich = editor.getRichMessage();
    [rich.input, rich.output].forEach((message) => {
      expect(message.blocks).toHaveLength(1);
      expect(message.blocks[0]).toMatchObject({
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Body'}
      });
    });

    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));
    let copied = tiptap.state.selection.content();
    tiptap.view.someProp('transformCopied', (transform) => {
      copied = transform(copied, tiptap.view);
    });
    expect(copied.content.childCount).toBe(1);
    expect(copied.content.firstChild?.textContent).toBe('Body');
    const serializeClipboard = tiptap.view.someProp('clipboardTextSerializer');
    expect(serializeClipboard?.(copied, tiptap.view)).toBe('Body');
  });

  test('blocks horizontal spaces on an empty first line', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const handleTextInput = tiptap.view.someProp('handleTextInput');

    [' ', '\u00a0', '\u3000', '\t'].forEach((space) => {
      expect(handleTextInput?.(
        tiptap.view,
        1,
        1,
        space,
        () => tiptap.state.tr.insertText(space)
      )).toBe(true);
    });
    expect(editor.replaceSelection(' \u00a0')).toBe(false);
    expect(editor.getRichValue(false, false).value).toBe('');

    const handleDOMEvents = tiptap.view.someProp('handleDOMEvents');
    const event = new InputEvent('beforeinput', {
      cancelable: true,
      data: ' ',
      inputType: 'insertText'
    });
    expect(handleDOMEvents.beforeinput(tiptap.view, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  test('allows spaces after content and on an empty later line', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const handleTextInput = tiptap.view.someProp('handleTextInput');

    expect(handleTextInput?.(
      tiptap.view,
      1,
      1,
      ' text',
      () => tiptap.state.tr.insertText(' text')
    )).toBe(false);
    expect(editor.replaceSelection('text')).toBe(true);
    expect(editor.replaceSelection(' ')).toBe(true);

    editor.setTextWithEntities('\n');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(Selection.atEnd(tiptap.state.doc)));
    const {from, to} = tiptap.state.selection;
    expect(handleTextInput?.(
      tiptap.view,
      from,
      to,
      ' ',
      () => tiptap.state.tr.insertText(' ')
    )).toBe(false);
  });

  test('blocks spaces when the empty first line has later content', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('\nsecond');
    const tiptap = (editor as TiptapEditorInternals).editor;
    const handleTextInput = tiptap.view.someProp('handleTextInput');

    expect(handleTextInput?.(
      tiptap.view,
      1,
      1,
      ' ',
      () => tiptap.state.tr.insertText(' ')
    )).toBe(true);
  });

  test.each([
    ['- ', 'bulletList'],
    ['1. ', 'orderedList']
  ] as const)('starts a %s list through the typing input rule', async(marker, listType) => {
    const {editor, inputField} = mountInputFieldEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.focusAtEnd(false);

    expect(tiptap.commands.insertContent(marker, {applyInputRules: true})).toBe(true);
    await new Promise((resolve) => setTimeout(resolve));
    expect(tiptap.getJSON().content?.[0].type).toBe(listType);
    expect(editor.isEmpty()).toBe(true);
    expect(isInputEmpty(editor.input)).toBe(true);
    expect(editor.isPlaceholderEmpty()).toBe(false);
    expect(isInputPlaceholderEmpty(editor.input)).toBe(false);
    expect(inputField.isEmpty()).toBe(true);
    expect(inputField.input.classList.contains('is-empty')).toBe(false);
    expect(inputField.placeholder.classList.contains('is-empty')).toBe(false);
  });

  test.each([
    ['bullet', 'bulletList', 'listItem', undefined],
    ['ordered', 'orderedList', 'listItem', undefined],
    ['checkbox', 'bulletList', 'listItem', {checkbox: true, checked: false}],
    ['task', 'taskList', 'taskItem', {checked: false}]
  ] as const)('Backspace removes an empty intermediate %s item and keeps the caret in the list', (
    _label,
    listType,
    itemType,
    itemAttributes
  ) => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const item = (text: string) => ({
      type: itemType,
      attrs: itemAttributes,
      content: [{
        type: 'paragraph',
        content: text ? [{type: 'text', text}] : undefined
      }]
    });
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: listType,
        content: [item('first'), item(''), item('third')]
      }]
    })).toBe(true);

    const positions: number[] = [];
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === itemType) positions.push(position);
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, positions[1] + 2)
    ));

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Backspace'
    });
    input.dispatchEvent(event);

    const list = tiptap.state.doc.firstChild;
    expect(event.defaultPrevented).toBe(true);
    expect(list?.type.name).toBe(listType);
    expect(list?.childCount).toBe(2);
    expect(list?.child(0).textContent).toBe('first');
    expect(list?.child(1).textContent).toBe('third');
    expect(tiptap.state.selection.$from.parent.textContent).toBe('first');
    expect(tiptap.state.selection.$from.parentOffset).toBe(5);
  });

  test('Backspace keeps the standard exit behavior for the final empty list item', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: ['first', ''].map((text) => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: text ? [{type: 'text', text}] : undefined
          }]
        }))
      }]
    })).toBe(true);

    let lastItemPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'listItem') lastItemPosition = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, lastItemPosition + 2)
    ));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Backspace'
    }));

    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(tiptap.state.selection.$from.depth).toBe(1);
  });

  test('uses Shift+Enter for list items when Enter is the send shortcut', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey,
      onKeyDown: (event) => {
        if(event.key !== 'Enter' || event.shiftKey) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    editor.setTextWithEntities('- first');
    editor.focusAtEnd();

    const pressEnter = (shiftKey = false) => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey
    }));
    pressEnter();

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(send).toHaveBeenCalledOnce();
    expect(tiptap.getJSON().content?.[0].content).toHaveLength(1);

    pressEnter(true);
    expect(send).toHaveBeenCalledOnce();
    expect(tiptap.getJSON().content?.[0].content).toHaveLength(2);
    expect(editor.getRichValue(false, false).value).toBe('- first\n- ');

    pressEnter(true);
    expect(send).toHaveBeenCalledOnce();
    expect(logicalContent(tiptap).map((node) => node.type)).toEqual(['bulletList', 'paragraph']);
    expect(editor.getRichValue(false, false).value).toBe('- first\n');

    pressEnter();
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('keeps the first configured newline in a paragraph and splits on the second', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey,
      onKeyDown: (event) => {
        if(event.key !== 'Enter' || event.shiftKey) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    editor.setTextWithEntities('first');
    editor.focusAtEnd();

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey: true
    }));

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(send).not.toHaveBeenCalled();
    expect(logicalContent(tiptap).map((node) => node.type)).toEqual(['paragraph']);
    expect(tiptap.getJSON().content?.[0].content).toMatchObject([
      {type: 'text', text: 'first'},
      {type: 'hardBreak'}
    ]);
    expect(editor.getRichValue(false, false).value).toBe('first\n');

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey: true
    }));

    expect(logicalContent(tiptap).map((node) => node.type))
    .toEqual(['paragraph', 'paragraph']);
    expect(tiptap.getJSON().content?.[0].content).toEqual([
      {type: 'text', text: 'first'}
    ]);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey: true
    }));

    expect(logicalContent(tiptap).map((node) => node.type))
    .toEqual(['paragraph', 'paragraph']);
    expect(tiptap.getJSON().content?.[1].content).toEqual([
      {type: 'hardBreak'}
    ]);
  });

  test('removes one configured newline when Backspace crosses a paragraph boundary', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey,
      onKeyDown: () => false
    });
    editors.push(editor);
    editor.setTextWithEntities('first');
    editor.focusAtEnd();

    const press = (key: 'Backspace' | 'Enter') => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      shiftKey: key === 'Enter'
    }));
    press('Enter');
    press('Enter');

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(logicalContent(tiptap).map((node) => node.type))
    .toEqual(['paragraph', 'paragraph']);

    press('Backspace');
    expect(logicalContent(tiptap).map((node) => node.type)).toEqual(['paragraph']);
    expect(tiptap.getJSON().content?.[0].content).toEqual([
      {type: 'text', text: 'first'},
      {type: 'hardBreak'}
    ]);

    press('Backspace');
    expect(tiptap.getJSON().content?.[0].content).toEqual([
      {type: 'text', text: 'first'}
    ]);
  });

  test('uses plain Enter for list items when Ctrl+Enter is the send shortcut', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && !event.ctrlKey,
      onKeyDown: (event) => {
        if(event.key !== 'Enter' || !event.ctrlKey) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    editor.setTextWithEntities('- first');
    editor.focusAtEnd();

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(send).not.toHaveBeenCalled();
    expect(tiptap.getJSON().content?.[0].content).toHaveLength(2);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'Enter'
    }));
    expect(send).toHaveBeenCalledOnce();
    expect(tiptap.getJSON().content?.[0].content).toHaveLength(2);
  });

  test('derives the new-line key from the current send shortcut', () => {
    const enter = (options: KeyboardEventInit = {}) => new KeyboardEvent('keydown', {
      key: 'Enter',
      ...options
    });

    setAppSettingsSilent('sendShortcut', 'enter');
    expect(isNewLineShortcutPressed(enter())).toBe(false);
    expect(isNewLineShortcutPressed(enter({shiftKey: true}))).toBe(true);

    setAppSettingsSilent('sendShortcut', 'ctrlEnter');
    expect(isNewLineShortcutPressed(enter())).toBe(true);
    expect(isNewLineShortcutPressed(enter({shiftKey: true}))).toBe(false);
  });

  test.each(['Backspace', 'Delete'])('collapses the selection after %s clears all content', (key) => {
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('sample');
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.selectAll()).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(AllSelection);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key
    });
    expect(input.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);

    expect(editor.getRichValue(true, true)).toEqual({value: '', entities: [], caretPos: 0});
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(tiptap.state.selection.from).toBe(1);
  });

  test('leaves a blockquote after pressing Enter twice', () => {
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('quoted', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 6,
      pFlags: {}
    }]);
    editor.focusAtEnd(false);
    const tiptap = (editor as TiptapEditorInternals).editor;

    const pressEnter = () => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
    expect(pressEnter()).toBe(false);
    expect(logicalContent(tiptap)[0].content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [
        {type: 'text', text: 'quoted'},
        {type: 'hardBreak'}
      ]
    });
    expect(pressEnter()).toBe(false);

    expect(logicalContent(tiptap).map((node) => node.type)).toEqual(['blockquote', 'paragraph']);
    expect(editor.getRichValue(true, false)).toEqual({
      value: 'quoted\n',
      entities: [{
        _: 'messageEntityBlockquote',
        offset: 0,
        length: 6,
        pFlags: {collapsed: undefined}
      }],
      caretPos: -1
    });
  });

  test('uses two Shift+Enters to leave a quote when Enter is the send shortcut', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey,
      onKeyDown: (event) => {
        if(event.key !== 'Enter' || event.shiftKey) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    editor.setTextWithEntities('quoted', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 6,
      pFlags: {}
    }]);
    editor.focusAtEnd();

    const pressEnter = (shiftKey = false) => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey
    }));
    pressEnter(true);
    pressEnter(true);

    expect(send).not.toHaveBeenCalled();
    expect(logicalContent((editor as TiptapEditorInternals).editor).map((node) => node.type))
    .toEqual(['blockquote', 'paragraph']);

    pressEnter();
    expect(send).toHaveBeenCalledOnce();
  });

  test('undoes and redoes editor transactions', () => {
    const {editor} = mountEditor();
    vi.useFakeTimers();
    try {
      editor.setTextWithEntities('A');
      vi.advanceTimersByTime(1000);
      editor.focusAtEnd(false);
      expect(editor.replaceSelection('B')).toBe(true);
      expect(editor.getRichValue(false, false).value).toBe('AB');

      const tiptap = (editor as TiptapEditorInternals).editor;
      expect(tiptap.commands.undo()).toBe(true);
      expect(editor.getRichValue(false, false).value).toBe('A');
      expect(tiptap.commands.redo()).toBe(true);
      expect(editor.getRichValue(false, false).value).toBe('AB');
    } finally {
      vi.useRealTimers();
    }
  });

  test('starts a fresh undo history when a draft is loaded', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('first draft');
    editor.focusAtEnd(false);
    expect(editor.replaceSelection(' changed')).toBe(true);

    editor.setTextWithEntities('second draft');
    editor.focusAtEnd(false);
    expect(editor.replaceSelection(' changed')).toBe(true);
    expect(tiptap.commands.undo()).toBe(true);
    expect(editor.getRichValue(false, false).value).toBe('second draft');
    expect(tiptap.commands.undo()).toBe(false);
  });

  test('deletes a whole grapheme and joins blocks from the emoji panel backspace', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('A👨‍👩‍👧');
    editor.focusAtEnd(false);
    expect(editor.deleteBackward()).toBe(true);
    expect(editor.getRichValue(false, false).value).toBe('A');

    editor.setTextWithEntities('first\nsecond');
    editor.restoreSelection({from: 8, to: 8}, false);
    expect(editor.deleteBackward()).toBe(true);
    expect(editor.getRichValue(false, false).value).toBe('firstsecond');
  });

  test.each([false, true])('preserves backward text selection with snapshot=%s', (snapshot) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('abcdef');
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 6, 2)
    ));
    const saved = editor.captureSelection();
    let restored = editor;
    if(snapshot) {
      restored = mountEditor(editor.snapshot()).editor;
    } else {
      editor.restoreSelection({from: 1, to: 1}, false);
      editor.restoreSelection(saved, false);
    }

    const selection = (restored as TiptapEditorInternals).editor.state.selection;
    expect(selection.anchor).toBe(6);
    expect(selection.head).toBe(2);
    expect(restored.getSelectedText()).toBe('bcde');
  });

  test.each([false, true])('preserves Select All over leading atoms with snapshot=%s', (snapshot) => {
    const {editor} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [
        {type: 'richDivider'},
        {type: 'paragraph', content: [{type: 'text', text: 'Body'}]},
        {type: 'richDivider'}
      ]
    });
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));
    const before = editor.getDocument();
    const saved = editor.captureSelection();
    let restored = editor;
    if(snapshot) restored = mountEditor(editor.snapshot()).editor;
    else editor.restoreSelection(saved, false);

    expect((restored as TiptapEditorInternals).editor.state.selection).toBeInstanceOf(AllSelection);
    expect(restored.getSelectedRichMessage()).toEqual(restored.getRichMessage());
    expect(restored.deleteBackward()).toBe(true);
    expect(restored.isEmpty()).toBe(true);
    expect(restored.undo()).toBe(true);
    expect(restored.getDocument()).toEqual(before);
  });

  test.each(['e\u0301', '👩🏽‍💻', '🇦🇪'])('deletes a complete styled grapheme %s from the emoji panel', (grapheme) => {
    const {editor} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'A'},
          ...Array.from(grapheme).map((text, index) => ({
            type: 'text', text, marks: [{type: index % 2 ? 'italic' : 'bold'}]
          })),
          {type: 'text', text: 'B'}
        ]
      }]
    });
    const before = editor.getDocument();
    editor.restoreSelection({from: 2 + grapheme.length, to: 2 + grapheme.length}, false);
    expect(editor.deleteBackward()).toBe(true);
    expect(editor.getRichValue(false, false).value).toBe('AB');
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
  });

  test('opens the link editor with the complete backward selection without changing content', () => {
    const onLinkEditor = vi.fn();
    const {editor} = mountEditor(undefined, {onLinkEditor});
    editor.setTextWithEntities('abcdef');
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 6, 2)));
    const before = editor.getDocument();
    expect(editor.requestLinkEditor()).toBe(true);
    expect(onLinkEditor).toHaveBeenCalledWith(expect.objectContaining({from: 2, to: 6, backward: true}));
    expect(editor.getDocument()).toEqual(before);
    expect(editor.canUndo()).toBe(false);
    expect(mountEditor().editor.requestLinkEditor()).toBe(false);
  });

  test.each(['table title', 'empty table cell', 'selected table', 'divider'])('keeps virtual and beforeinput Backspace equal to the keyboard at %s', (context) => {
    const results = ['keyboard', 'virtual', 'beforeinput'].map((source) => {
      const {editor} = mountEditor();
      const tiptap = (editor as TiptapEditorInternals).editor;
      if(context === 'divider') {
        editor.setDocument({type: 'doc', content: [{type: 'richDivider'}]});
        const position = tiptap.state.doc.content.size - 1;
        tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, position)));
      } else {
        editor.setDocument(tableDocument([['', ''], ['', '']], false));
        const table = currentTable(tiptap);
        if(context === 'selected table') {
          tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
            tiptap.state.doc,
            table.start + table.map.map[0],
            table.start + table.map.map[3]
          )));
        } else {
          const position = context === 'table title' ? 2 : table.start + table.map.map[0] + 2;
          tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, position)));
        }
      }
      const handled = source === 'virtual' ? editor.deleteBackward() : source === 'beforeinput' ?
        tiptap.view.someProp('handleDOMEvents').beforeinput(tiptap.view, new InputEvent('beforeinput', {
          cancelable: true,
          inputType: 'deleteContentBackward'
        })) : tiptap.view.someProp(
        'handleKeyDown',
        (handler) => handler(tiptap.view, new KeyboardEvent('keydown', {key: 'Backspace'}))
      );
      expect(handled).toBe(true);
      return {document: editor.getDocument(), selection: editor.captureSelection()};
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  test.each([
    {type: 'inlineMath', attrs: {source: 'x^2'}},
    {type: 'inlineRichAnchor', attrs: {name: 'section'}}
  ])('deletes an inline $type with virtual Backspace and restores it with Undo', (atom) => {
    const {editor} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'A'}, atom, {type: 'text', text: 'B'}]}]
    });
    const before = editor.getDocument();
    editor.restoreSelection({from: 3, to: 3}, false);

    expect(editor.deleteBackward()).toBe(true);
    expect(editor.getDocument()).toEqual({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'AB'}]}]});
    expect(editor.captureSelection()).toMatchObject({from: 2, to: 2});
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
  });

  test('does not let virtual Backspace modify a readonly editor', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Readonly');
    editor.focusAtEnd();
    const before = editor.getDocument();
    editor.setEditable(false);
    expect(editor.deleteBackward()).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  test.each(['readonly', 'composing', 'non-cancelable'])('does not synthesize beforeinput deletion when %s', (condition) => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setDocument({type: 'doc', content: [{type: 'richDivider'}]});
    editor.focusAtEnd();
    const before = editor.getDocument();
    if(condition === 'readonly') editor.setEditable(false);
    if(condition === 'composing') input.dispatchEvent(new CompositionEvent('compositionstart'));
    const selection = editor.captureSelection();
    const event = new InputEvent('beforeinput', {
      cancelable: condition !== 'non-cancelable',
      inputType: 'deleteContentBackward',
      isComposing: condition === 'composing'
    });
    expect(tiptap.view.someProp('handleDOMEvents').beforeinput(tiptap.view, event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.captureSelection()).toEqual(selection);
  });

  test('keeps beforeinput forward deletion equal to Delete at a divider boundary', () => {
    const results = [false, true].map((beforeinput) => {
      const {editor} = mountEditor();
      const tiptap = (editor as TiptapEditorInternals).editor;
      editor.setDocument({type: 'doc', content: [
        {type: 'paragraph', content: [{type: 'text', text: 'A'}]},
        {type: 'richDivider'}
      ]});
      editor.restoreSelection({from: 2, to: 2}, false);
      const handled = beforeinput ? tiptap.view.someProp('handleDOMEvents').beforeinput(
        tiptap.view,
        new InputEvent('beforeinput', {cancelable: true, inputType: 'deleteContentForward'})
      ) : tiptap.view.someProp('handleKeyDown', (handler) => handler(
        tiptap.view,
        new KeyboardEvent('keydown', {key: 'Delete'})
      ));
      expect(handled).toBe(true);
      return {doc: editor.getDocument(), selection: editor.captureSelection()};
    });
    expect(results[1]).toEqual(results[0]);
  });
});
