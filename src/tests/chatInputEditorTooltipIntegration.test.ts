import {useChatInputEditorHarness, TiptapEditorInternals, currentTable} from '@/tests/helpers/chatInputEditorHarness';
import {TextSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import {CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT} from '@components/chat/inputEditor/events';

describe('Tiptap chat input editor: Tooltip', () => {
  const {mountEditor, selectAllText} = useChatInputEditorHarness();

  test('refreshes an open MarkupTooltip after ProseMirror undo and redo', async() => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('history');
    selectAllText(editor, 7);
    expect(editor.applyMarkup({type: 'bold'})).toBe(true);
    await Promise.resolve();
    expect(editor.getMarkupState('bold').fully).toBe(true);

    const tooltip = new MarkupTooltip();
    const setActiveMarkupButton = vi.spyOn(tooltip, 'setActiveMarkupButton').mockImplementation(() => {});
    (tooltip as unknown as {input: HTMLElement}).input = input;
    tooltip.handleSelection();
    const tiptap = (editor as TiptapEditorInternals).editor;

    expect(tiptap.commands.undo()).toBe(true);
    await Promise.resolve();
    expect(editor.getMarkupState('bold').fully).toBe(false);
    expect(setActiveMarkupButton).toHaveBeenCalledTimes(1);

    expect(tiptap.commands.redo()).toBe(true);
    await Promise.resolve();
    expect(editor.getMarkupState('bold').fully).toBe(true);
    expect(setActiveMarkupButton).toHaveBeenCalledTimes(2);
  });

  test('resets MarkupTooltip scroll only after its hide animation', async() => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const tooltip = new MarkupTooltip();
    const container = document.createElement('div');
    const scrollContainer = document.createElement('div');
    container.classList.add('is-visible');
    scrollContainer.scrollLeft = 120;
    Object.assign(tooltip as unknown as Record<string, unknown>, {
      container,
      init: undefined,
      scrollContainer
    });

    vi.useFakeTimers();
    try {
      tooltip.hide();
      expect(container.classList.contains('is-visible')).toBe(false);
      expect(container.classList.contains('hide')).toBe(false);
      expect(scrollContainer.scrollLeft).toBe(120);

      vi.advanceTimersByTime(199);
      expect(container.classList.contains('hide')).toBe(false);
      expect(scrollContainer.scrollLeft).toBe(120);

      vi.advanceTimersByTime(1);
      expect(container.classList.contains('hide')).toBe(true);
      expect(scrollContainer.scrollLeft).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not expose table cell selections to MarkupTooltip', async() => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const {editor, input} = mountEditor();
    expect(editor.insertTable({columns: 2, rows: 2})).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const table = currentTable(tiptap);
    const firstCell = table.start + table.map.map[0];
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      firstCell
    )));

    const tooltip = new MarkupTooltip();
    (tooltip as unknown as {input: HTMLElement}).input = input;
    expect((
      tooltip as unknown as {hasFormattableSelection(): boolean}
    ).hasFormattableSelection()).toBe(false);
  });

  test.each([
    {name: 'a paragraph boundary', value: 'a\nb', from: 2, to: 4, expected: false},
    {name: 'whitespace', value: ' \t\u00a0', from: 1, to: 4, expected: false},
    {name: 'text across paragraphs', value: 'a\nb', from: 1, to: 5, expected: true}
  ])('checks formattable text when MarkupTooltip selects $name', async({value, from, to, expected}) => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const {editor, input} = mountEditor();
    editor.setTextWithEntities(value);
    editor.restoreSelection({from, to}, false);

    const tooltip = new MarkupTooltip();
    (tooltip as unknown as {input: HTMLElement}).input = input;
    expect((
      tooltip as unknown as {hasFormattableSelection(): boolean}
    ).hasFormattableSelection()).toBe(expected);
  });

  // Formatting now requires the composer: every field that offers it mounts one,
  // and the DOM-selection fallback is gone. The cases above cover the live rule.
  test('treats a field without the composer as not formattable', async() => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const input = document.createElement('div');
    input.contentEditable = 'true';
    input.textContent = 'a\nb';
    document.body.append(input);
    const range = document.createRange();
    range.selectNodeContents(input);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const tooltip = new MarkupTooltip();
    (tooltip as unknown as {input: HTMLElement}).input = input;
    expect((
      tooltip as unknown as {hasFormattableSelection(): boolean}
    ).hasFormattableSelection()).toBe(false);
    input.remove();
  });

  test('rechecks a late mouse text selection after ProseMirror commits it', async() => {
    const {default: MarkupTooltip} = await vi.importActual<typeof import('@components/chat/markupTooltip')>(
      '@components/chat/markupTooltip'
    );
    const {editor, input} = mountEditor();
    editor.setTextWithEntities('partial selection');
    input.focus();
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1)
    ));

    const text = input.querySelector<HTMLElement>(
      '[data-chat-input-paragraph]'
    )?.firstChild;
    expect(text?.nodeType).toBe(Node.TEXT_NODE);
    const range = document.createRange();
    range.setStart(text!, 0);
    range.setEnd(text!, 7);
    const nativeSelection = document.getSelection()!;
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);

    const tooltip = new MarkupTooltip();
    const show = vi.spyOn(tooltip, 'show').mockImplementation(() => {});
    const hide = vi.spyOn(tooltip, 'hide').mockImplementation(() => {});
    tooltip.handleSelection();
    (
      tooltip as unknown as {handleSelectionChange(): void}
    ).handleSelectionChange();

    expect(show).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledTimes(1);
    hide.mockClear();

    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1, 8)
    ));
    (
      tooltip as unknown as {handleSelectionChange(event?: Event): void}
    ).handleSelectionChange(new Event(CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT));
    await Promise.resolve();

    expect(show).toHaveBeenCalledTimes(1);
    expect(hide).not.toHaveBeenCalled();
  });
});
