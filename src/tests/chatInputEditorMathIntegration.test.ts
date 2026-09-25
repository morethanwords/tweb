import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import {NodeSelection, TextSelection} from '@tiptap/pm/state';
import {getIconContent} from '@components/icon';

describe('Tiptap chat input editor: Math', () => {
  const {editors, mountEditor} = useChatInputEditorHarness();

  test('preserves math NodeSelections and edits selected formulas in place', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before '},
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          {type: 'text', text: ' after'}
        ]
      }]
    })).toBe(true);

    let inlineMathPosition: number;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'inlineMath') inlineMathPosition = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, inlineMathPosition)
    ));
    const selection = editor.captureSelection();
    expect(selection).toEqual({
      from: inlineMathPosition,
      to: inlineMathPosition + 1,
      type: 'node'
    });
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'x^2'});

    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 1)));
    editor.restoreSelection(selection, false);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.insertInlineMath('y + 1')).toBe(true);
    expect(editor.getDocument().content?.[0].content).toEqual([
      {type: 'text', text: 'before '},
      {type: 'inlineMath', attrs: {source: 'y + 1'}},
      {type: 'text', text: ' after'}
    ]);

    const snapshot = editor.snapshot();
    const restored = mountEditor(snapshot).editor;
    expect(restored.captureSelection()).toEqual(selection);
    expect(restored.getSelectedMath()).toEqual({block: false, source: 'y + 1'});

    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'blockMath', attrs: {source: '\\sum_i x_i'}},
        {type: 'paragraph'}
      ]
    })).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(NodeSelection.create(tiptap.state.doc, 0)));
    expect(editor.getSelectedMath()).toEqual({block: true, source: '\\sum_i x_i'});
    expect(editor.insertBlockMath('\\prod_i x_i')).toBe(true);
    expect(editor.getDocument().content).toEqual([
      {type: 'blockMath', attrs: {source: '\\prod_i x_i'}},
      {type: 'paragraph'}
    ]);
  });

  test('edits clicked formulas through the contextual tooltip with undo and redo', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before '},
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          {type: 'text', text: ' after'}
        ]
      }]
    })).toBe(true);

    const inlineMath = input.querySelector<HTMLElement>('[data-inline-math]')!;
    let inlineMathPosition: number;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'inlineMath') inlineMathPosition = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, inlineMathPosition)
    ));
    expect(input.querySelector('[data-inline-math]')).toBe(inlineMath);
    inlineMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    const tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    expect(tooltip).not.toBeNull();
    expect(tooltip.classList.contains('markup-tooltip')).toBe(true);
    expect(tooltip.classList.contains('is-visible')).toBe(true);
    const modeButton = tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    const tools = tooltip.querySelector<HTMLElement>('.chat-input-math-tooltip-tools')!;
    expect(modeButton.disabled).toBe(false);
    expect(modeButton.querySelector('.tgico')?.textContent).toBe(
      getIconContent('expand')
    );
    expect(tools.children).toHaveLength(5);
    expect(tools.children[0]).toBe(modeButton);
    expect(tools.children[1].classList.contains('markup-tooltip-delimiter')).toBe(true);
    expect(tools.children[2].classList.contains(
      'chat-input-math-tooltip-input-wrapper'
    )).toBe(true);
    expect(tools.children[3].classList.contains('markup-tooltip-delimiter')).toBe(true);
    expect(tools.children[4].classList.contains('chat-input-math-tooltip-save')).toBe(true);
    expect(tooltip.style.left).toBe('8px');
    expect(tooltip.style.top).toBe('8px');
    expect(tooltip.style.transform).toBe('');
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(inlineMath.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(inlineMath.classList.contains('chat-input-math-selected')).toBe(false);

    const formulaInput = tooltip.querySelector<HTMLInputElement>(
      '.chat-input-math-tooltip-input'
    )!;
    expect(formulaInput.value).toBe('x^2');
    formulaInput.value = ' y + 1 ';
    formulaInput.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter'
    }));

    expect(document.body.querySelector('.chat-input-math-tooltip')).toBeNull();
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'y + 1'});
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.undo()).toBe(true);
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'x^2'});
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.redo()).toBe(true);
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'y + 1'});
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
  });

  test('toggles formula inline mode from the contextual tooltip', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const originalDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before '},
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          {type: 'text', text: ' after'}
        ]
      }]
    };
    expect(editor.setDocument(originalDocument)).toBe(true);

    input.querySelector<HTMLElement>('[data-inline-math]')!
    .dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    let tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    let modeButton = tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    const formulaInput = tooltip.querySelector<HTMLInputElement>(
      '.chat-input-math-tooltip-input'
    )!;
    expect(modeButton.querySelector('.tgico')?.textContent).toBe(
      getIconContent('expand')
    );
    formulaInput.value = 'y + 1';
    modeButton.click();

    tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    expect(tooltip).not.toBeNull();
    expect(tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )?.querySelector('.tgico')?.textContent).toBe(getIconContent('collapse'));
    expect(editor.getDocument().content).toEqual([{
      type: 'paragraph',
      content: [{type: 'text', text: 'before '}]
    }, {
      type: 'blockMath',
      attrs: {source: 'y + 1'}
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: ' after'}]
    }]);
    expect(editor.getSelectedMath()).toEqual({block: true, source: 'y + 1'});
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(originalDocument);
    expect(editor.redo()).toBe(true);
    expect(editor.getSelectedMath()).toEqual({block: true, source: 'y + 1'});

    input.querySelector<HTMLElement>('[data-block-math]')!
    .dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    modeButton = tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    expect(modeButton.querySelector('.tgico')?.textContent).toBe(
      getIconContent('collapse')
    );
    modeButton.click();

    tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    expect(tooltip).not.toBeNull();
    expect(tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )?.querySelector('.tgico')?.textContent).toBe(getIconContent('expand'));
    expect(editor.getDocument().content).toEqual([{
      type: 'paragraph',
      content: [{type: 'text', text: 'before '}]
    }, {
      type: 'paragraph',
      content: [{type: 'inlineMath', attrs: {source: 'y + 1'}}]
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: ' after'}]
    }]);
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'y + 1'});
  });

  test('keeps block conversion enabled after a standalone formula becomes inline', () => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'blockMath', attrs: {source: 'x^2'}},
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'next'}]
        }
      ]
    })).toBe(true);

    input.querySelector<HTMLElement>('[data-block-math]')!
    .dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    let tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    let modeButton = tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    expect(modeButton.disabled).toBe(false);
    modeButton.click();

    tooltip = document.body.querySelector<HTMLElement>('.chat-input-math-tooltip')!;
    modeButton = tooltip.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    expect(editor.getSelectedMath()).toEqual({block: false, source: 'x^2'});
    expect(modeButton.querySelector('.tgico')?.textContent).toBe(
      getIconContent('expand')
    );
    expect(modeButton.disabled).toBe(false);
    expect(editor.getDocument().content).toEqual([{
      type: 'paragraph',
      content: [{type: 'inlineMath', attrs: {source: 'x^2'}}]
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: 'next'}]
    }]);

    modeButton.click();
    expect(editor.getSelectedMath()).toEqual({block: true, source: 'x^2'});
  });

  test('disables expanding inline math where block math is not allowed', () => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'details',
        attrs: {open: true},
        content: [{type: 'detailsSummary'}, {
          type: 'detailsBody',
          content: [{
            type: 'paragraph',
            content: [{type: 'inlineMath', attrs: {source: 'x'}}]
          }]
        }]
      }]
    })).toBe(true);

    input.querySelector<HTMLElement>('[data-inline-math]')!
    .dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    const modeButton = document.body.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-mode'
    )!;
    expect(modeButton.disabled).toBe(true);
    expect(modeButton.querySelector('.tgico')?.textContent).toBe(
      getIconContent('expand')
    );
  });

  test('visually selects formulas covered by a text or whole-document selection', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {type: 'text', text: 'before '},
          {type: 'inlineMath', attrs: {source: 'x^2'}},
          {type: 'text', text: ' after'}
        ]
      }, {
        type: 'blockMath', attrs: {source: '\\sum_i x_i'}
      }, {
        type: 'paragraph', content: [{type: 'text', text: 'end'}]
      }]
    })).toBe(true);

    const inlineMath = input.querySelector<HTMLElement>('[data-inline-math]')!;
    const blockMath = input.querySelector<HTMLElement>('[data-block-math]')!;
    let inlinePosition: number;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'inlineMath') inlinePosition = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      inlinePosition - 1,
      inlinePosition + 2
    )));
    expect(inlineMath.classList.contains('chat-input-math-selected')).toBe(true);
    expect(blockMath.classList.contains('chat-input-math-selected')).toBe(false);

    tiptap.commands.selectAll();
    expect(inlineMath.classList.contains('chat-input-math-selected')).toBe(true);
    expect(blockMath.classList.contains('chat-input-math-selected')).toBe(true);
    expect(blockMath.querySelector(':scope > .chat-input-math-content')).not.toBeNull();
  });

  test('reuses one math tooltip and closes it on Escape, outside press, and node-view destroy', () => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{type: 'inlineMath', attrs: {source: 'a'}}]
        },
        {type: 'blockMath', attrs: {source: 'b'}},
        {type: 'paragraph'}
      ]
    })).toBe(true);

    const inlineMath = input.querySelector<HTMLElement>('[data-inline-math]')!;
    const blockMath = input.querySelector<HTMLElement>('[data-block-math]')!;
    inlineMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    expect(document.body.querySelectorAll('.chat-input-math-tooltip')).toHaveLength(1);
    blockMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    expect(document.body.querySelectorAll('.chat-input-math-tooltip')).toHaveLength(1);
    const blockFormulaInput = document.body.querySelector<HTMLInputElement>(
      '.chat-input-math-tooltip-input'
    )!;
    expect(blockFormulaInput.value).toBe('b');
    blockFormulaInput.value = 'c';
    document.body.querySelector<HTMLButtonElement>(
      '.chat-input-math-tooltip-save'
    )!.click();
    expect(editor.getSelectedMath()).toEqual({block: true, source: 'c'});
    expect(document.body.querySelector('.chat-input-math-tooltip')).toBeNull();

    blockMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    document.body.querySelector<HTMLInputElement>(
      '.chat-input-math-tooltip-input'
    )!.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'Escape'}));
    expect(document.body.querySelector('.chat-input-math-tooltip')).toBeNull();

    blockMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(document.body.querySelector('.chat-input-math-tooltip')).toBeNull();

    blockMath.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
    expect(document.body.querySelector('.chat-input-math-tooltip')).not.toBeNull();
    editors.splice(editors.indexOf(editor), 1);
    editor.destroy();
    expect(document.body.querySelector('.chat-input-math-tooltip')).toBeNull();
  });
});
