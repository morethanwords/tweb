import {useChatInputEditorHarness, TiptapEditorInternals, tableDocument} from '@/tests/helpers/chatInputEditorHarness';
import createChatInputEditor from '@components/chat/inputEditor';

describe('Tiptap chat input editor: BlockSelection', () => {
  const {editors, mountEditor, logicalTopLevelText} = useChatInputEditorHarness();

  test.each([
    {
      name: 'closed details',
      block: {
        type: 'details',
        attrs: {open: false},
        content: [
          {type: 'detailsSummary', content: [{type: 'text', text: 'More'}]},
          {
            type: 'detailsBody',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'Content'}]},
              {type: 'paragraph', content: [{type: 'text', text: 'Nested'}]}
            ]
          }
        ]
      }
    },
    {
      name: 'list',
      block: {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            {type: 'paragraph', content: [{type: 'text', text: 'Content'}]},
            {
              type: 'bulletList',
              content: [{
                type: 'listItem',
                content: [{type: 'paragraph', content: [{type: 'text', text: 'Nested'}]}]
              }]
            }
          ]
        }]
      }
    },
    {
      name: 'quote',
      block: {
        type: 'blockquote',
        content: [
          {type: 'paragraph', content: [{type: 'text', text: 'Content'}]},
          {type: 'paragraph', content: [{type: 'text', text: 'Nested'}]}
        ]
      }
    },
    {
      name: 'table',
      block: tableDocument([['Content', 'Nested']], false).content![0]
    }
  ])('moves a top-level $name atomically and keeps the text selection', ({block}) => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
        block,
        {type: 'paragraph', content: [{type: 'text', text: 'After'}]}
      ]
    })).toBe(true);

    const canonicalBlock = tiptap.state.doc.child(1).toJSON();
    let contentPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === 'Content') {
        contentPosition = position;
        return false;
      }
    });
    expect(contentPosition).toBeGreaterThan(0);
    editor.restoreSelection({from: contentPosition, to: contentPosition}, false);

    expect(editor.moveBlockUp()).toBe(true);
    expect(tiptap.state.doc.child(0).toJSON()).toEqual(canonicalBlock);
    expect(tiptap.state.selection.$from.index(0)).toBe(0);

    expect(editor.undo()).toBe(true);
    expect(tiptap.state.doc.child(1).toJSON()).toEqual(canonicalBlock);
    expect(editor.moveBlockDown()).toBe(true);
    expect(tiptap.state.doc.child(2).toJSON()).toEqual(canonicalBlock);
    expect(tiptap.state.selection.$from.index(0)).toBe(2);
    expect(editor.moveBlockDown()).toBe(false);
  });

  test('selects a top-level block without blocking caret placement and keeps keyboard reordering', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    editor.setTextWithEntities('First\nSecond\nThird');

    const secondPosition = tiptap.state.doc.child(0).nodeSize + 1;
    const click = new MouseEvent('click', {button: 0, bubbles: true, cancelable: true});
    Object.defineProperty(click, 'target', {
      value: tiptap.view.nodeDOM(tiptap.state.doc.child(0).nodeSize)
    });
    let clickHandled = false;
    tiptap.view.someProp('handleClick', (handleClick) => {
      clickHandled = !!handleClick(tiptap.view, secondPosition, click);
      return clickHandled;
    });
    expect(clickHandled).toBe(false);
    expect(input.querySelector('.chat-input-block-selected')?.textContent).toBe('Second');
    expect(input.querySelector('.chat-input-block-drag-handle')).toBeNull();
    expect(input.querySelector('.chat-input-block-drag-anchor')).toBeNull();
    expect(input.getAttribute('aria-keyshortcuts')).toBe(
      'Alt+Shift+ArrowUp Alt+Shift+ArrowDown'
    );

    editor.restoreSelection({from: secondPosition, to: secondPosition}, false);
    const thirdPosition =
      tiptap.state.doc.child(0).nodeSize +
      tiptap.state.doc.child(1).nodeSize +
      1;
    editor.restoreSelection({from: thirdPosition, to: thirdPosition}, false);
    expect(input.querySelector('.chat-input-block-selected')?.textContent).toBe('Third');
    editor.restoreSelection({from: secondPosition, to: secondPosition}, false);
    input.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowUp',
      shiftKey: true
    }));

    expect(logicalTopLevelText(tiptap)).toEqual(['Second', 'First', 'Third']);
    expect(input.querySelector('.chat-input-block-selected')?.textContent).toBe('Second');

    input.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
      shiftKey: true
    }));
    expect(logicalTopLevelText(tiptap)).toEqual(['First', 'Second', 'Third']);
  });

  test('can disable frame block selection and reordering', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const editor = createChatInputEditor(input, {enableBlockSelection: false});
    editors.push(editor);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    editor.setTextWithEntities('First\nSecond\nThird');

    const secondPosition = tiptap.state.doc.child(0).nodeSize + 1;
    editor.restoreSelection({from: secondPosition, to: secondPosition}, false);
    expect(input.querySelector('.chat-input-block-selected')).toBeNull();
    expect(input.getAttribute('aria-keyshortcuts')).toBeNull();

    input.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowUp',
      shiftKey: true
    }));
    expect(logicalTopLevelText(tiptap)).toEqual(['First', 'Second', 'Third']);
  });

  test('extends structural selection with Shift-click and moves the range atomically', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    editor.setTextWithEntities('First\nSecond\nThird\nFourth');

    const blockElements: HTMLElement[] = [];
    let position = 0;
    for(let index = 0; index < 4; ++index) {
      blockElements.push(tiptap.view.nodeDOM(position) as HTMLElement);
      position += tiptap.state.doc.child(index).nodeSize;
    }
    const clickBlock = (index: number, shiftKey = false) => {
      const event = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        shiftKey
      });
      Object.defineProperty(event, 'target', {value: blockElements[index]});
      let handled = false;
      tiptap.view.someProp('handleClick', (handleClick) => {
        handled = !!handleClick(tiptap.view, 1, event);
        return handled;
      });
      return handled;
    };

    expect(clickBlock(1)).toBe(false);
    expect(clickBlock(3, true)).toBe(true);
    expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
    .map((element) => element.textContent)).toEqual(['Second', 'Third', 'Fourth']);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowUp',
      shiftKey: true
    }));
    expect(logicalTopLevelText(tiptap)).toEqual(['Second', 'Third', 'Fourth', 'First']);
    expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
    .map((element) => element.textContent)).toEqual(['Second', 'Third', 'Fourth']);

    expect(editor.undo()).toBe(true);
    expect(logicalTopLevelText(tiptap)).toEqual(['First', 'Second', 'Third', 'Fourth']);
  });

  test('reorders an ordered-list item range without losing list numbering metadata', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: {start: 7, type: 'A', reversed: true},
        content: [
          {type: 'listItem', attrs: {value: 7}, content: [{type: 'paragraph', content: [{type: 'text', text: 'First'}]}]},
          {type: 'listItem', attrs: {value: 9}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Second'}]}]},
          {type: 'listItem', attrs: {value: 12}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Third'}]}]},
          {type: 'listItem', attrs: {value: 20}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Fourth'}]}]}
        ]
      }]
    })).toBe(true);

    const list = tiptap.state.doc.child(0);
    const positions: number[] = [];
    let position = 1;
    for(let index = 0; index < list.childCount; ++index) {
      positions.push(position);
      position += list.child(index).nodeSize;
    }
    const clickItem = (index: number, shiftKey = false) => {
      const target = tiptap.view.nodeDOM(positions[index]) as HTMLElement;
      const event = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        shiftKey
      });
      Object.defineProperty(event, 'target', {value: target});
      let handled = false;
      tiptap.view.someProp('handleClick', (handleClick) => {
        handled = !!handleClick(tiptap.view, positions[index] + 1, event);
        return handled;
      });
      return handled;
    };

    expect(clickItem(1)).toBe(false);
    expect(clickItem(2, true)).toBe(true);
    expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
    .map((element) => element.textContent)).toEqual(['Second', 'Third']);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
      shiftKey: true
    }));

    const reordered = tiptap.state.doc.child(0);
    expect(reordered.attrs).toMatchObject({start: 7, type: 'A', reversed: true});
    expect([...Array(reordered.childCount)].map((_, index) => (
      reordered.child(index).textContent
    ))).toEqual(['First', 'Fourth', 'Second', 'Third']);
    expect([...Array(reordered.childCount)].map((_, index) => (
      reordered.child(index).attrs.value
    ))).toEqual([7, 20, 9, 12]);
    expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
    .map((element) => element.textContent)).toEqual(['Second', 'Third']);
  });

  test('drags adjacent task items atomically and rejects a drop into the range itself', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          {type: 'taskItem', attrs: {checked: false}, content: [{type: 'paragraph', content: [{type: 'text', text: 'First'}]}]},
          {type: 'taskItem', attrs: {checked: true}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Second'}]}]},
          {type: 'taskItem', attrs: {checked: false}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Third'}]}]},
          {type: 'taskItem', attrs: {checked: true}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Fourth'}]}]}
        ]
      }]
    })).toBe(true);

    const list = tiptap.state.doc.child(0);
    const elements: HTMLElement[] = [];
    const positions: number[] = [];
    let position = 1;
    for(let index = 0; index < list.childCount; ++index) {
      positions.push(position);
      const element = tiptap.view.nodeDOM(position) as HTMLElement;
      elements.push(element);
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        bottom: (index + 1) * 40,
        height: 40,
        left: 0,
        right: 200,
        top: index * 40,
        width: 200,
        x: 0,
        y: index * 40,
        toJSON: () => ({})
      });
      position += list.child(index).nodeSize;
    }
    const clickItem = (index: number, shiftKey = false) => {
      const event = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        shiftKey
      });
      Object.defineProperty(event, 'target', {value: elements[index]});
      tiptap.view.someProp('handleClick', (handleClick) => (
        handleClick(tiptap.view, positions[index] + 1, event)
      ));
    };
    const pointerEvent = (
      type: string,
      pointerId: number,
      clientY: number
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: pointerId},
        pointerType: {value: 'mouse'}
      });
      return event;
    };
    const taskState = () => {
      const current = tiptap.state.doc.child(0);
      return [...Array(current.childCount)].map((_, index) => ({
        checked: current.child(index).attrs.checked,
        text: current.child(index).textContent
      }));
    };

    clickItem(1);
    clickItem(2, true);
    elements[1].dispatchEvent(pointerEvent('pointerdown', 7, 60));
    elements[1].dispatchEvent(pointerEvent('pointermove', 7, 100));
    expect(input.querySelector('.chat-input-block-drop-indicator')).toBeNull();
    elements[1].dispatchEvent(pointerEvent('pointerup', 7, 100));
    expect(taskState()).toEqual([
      {checked: false, text: 'First'},
      {checked: true, text: 'Second'},
      {checked: false, text: 'Third'},
      {checked: true, text: 'Fourth'}
    ]);

    elements[1].dispatchEvent(pointerEvent('pointerdown', 8, 60));
    elements[1].dispatchEvent(pointerEvent('pointermove', 8, 1));
    expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
    elements[1].dispatchEvent(pointerEvent('pointerup', 8, 1));
    expect(taskState()).toEqual([
      {checked: true, text: 'Second'},
      {checked: false, text: 'Third'},
      {checked: false, text: 'First'},
      {checked: true, text: 'Fourth'}
    ]);
  });
});
