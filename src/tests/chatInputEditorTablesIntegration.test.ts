import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  tableDocument,
  currentTable
} from '@/tests/helpers/chatInputEditorHarness';
import {TextSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import createChatInputEditor from '@components/chat/inputEditor';

describe('Tiptap chat input editor: Tables', () => {
  const {editors, mountEditor, expectSingleTerminalParagraph} = useChatInputEditorHarness();

  test('renders HTML tables and supports row and column commands with history', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.setContent([
      '<table><thead><tr><th>Name</th><th>State</th></tr></thead>',
      '<tbody><tr><td>Build</td><td>Ready</td></tr></tbody></table>'
    ].join(''))).toBe(true);

    const table = input.querySelector<HTMLTableElement>(
      '.chat-input-table-wrapper table.chat-input-table'
    );
    expect(table).toBeTruthy();
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows[0].cells[0].classList.contains('chat-input-table-header')).toBe(true);
    const initialTable = currentTable(tiptap);
    expect(tiptap.commands.setTextSelection(
      initialTable.start + initialTable.map.map[0] + 2
    )).toBe(true);

    expect(editor.addTableRowAfter()).toBe(true);
    expect(table?.rows).toHaveLength(3);
    expect(editor.deleteTableRow()).toBe(true);
    expect(table?.rows).toHaveLength(2);
    expect(editor.addTableColumnAfter()).toBe(true);
    expect(table?.rows[0].cells).toHaveLength(3);
    expect(editor.deleteTableColumn()).toBe(true);
    expect(table?.rows[0].cells).toHaveLength(2);
    expect(tiptap.commands.undo()).toBe(true);
    expect(table?.rows[0].cells).toHaveLength(3);
    expect(tiptap.commands.redo()).toBe(true);
    expect(table?.rows[0].cells).toHaveLength(2);
    expect(editor.deleteTable()).toBe(true);
    expect(input.querySelector('table')).toBeNull();
    expect(editor.insertTable({columns: 2, rows: 2, withHeaderRow: true})).toBe(true);
    const inserted = input.querySelector<HTMLTableElement>(
      '.chat-input-table-wrapper table.chat-input-table'
    );
    expect(inserted?.rows).toHaveLength(2);
    expect(inserted?.rows[0].cells).toHaveLength(2);
    expect(inserted?.rows[0].cells[0].tagName).toBe('TH');
    expect(inserted?.rows[0].cells[0].style.verticalAlign).toBe('');

    const {
      map: insertedMap,
      start: insertedTableStart
    } = currentTable(tiptap);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(CellSelection.create(
      tiptap.state.doc,
      insertedTableStart + insertedMap.map[0],
      insertedTableStart + insertedMap.map[1]
    )));
    expect(editor.canMergeTableCells()).toBe(true);
    expect(editor.mergeTableCells()).toBe(true);
    expect(inserted?.rows[0].cells).toHaveLength(1);
    expect(editor.canSplitTableCell()).toBe(true);
    expect(editor.splitTableCell()).toBe(true);
    expect(inserted?.rows[0].cells).toHaveLength(2);
  });

  test.each(['ArrowDown', 'ArrowRight'] as const)(
    'moves %s from the final table cell into the terminal paragraph without adding a row',
    (key) => {
      const {editor, input} = mountEditor();
      const tiptap = (editor as TiptapEditorInternals).editor;
      expect(editor.setDocument(tableDocument([['A', 'B'], ['C', 'D']]))).toBe(true);
      expectSingleTerminalParagraph(input, tiptap);

      const {map, start: tableStart} = currentTable(tiptap);
      const initialHeight = map.height;
      const lastCellPosition = tableStart + map.map[map.map.length - 1];
      const lastCell = tiptap.state.doc.nodeAt(lastCellPosition)!;
      tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
        tiptap.state.doc,
        lastCellPosition + lastCell.nodeSize - 2
      )));

      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key
      });
      input.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(currentTable(tiptap).map.height).toBe(initialHeight);
      expect(tiptap.state.selection.$from.index(0)).toBe(tiptap.state.doc.childCount - 1);
      expect(tiptap.state.selection.$from.parent).toBe(tiptap.state.doc.lastChild);
      expect(tiptap.state.selection.from).toBe(tiptap.state.doc.content.size - 1);
      expectSingleTerminalParagraph(input, tiptap);
    }
  );

  test('adds a row when Tab is pressed in the final table cell', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument(tableDocument([['A', 'B'], ['C', 'D']]))).toBe(true);
    expectSingleTerminalParagraph(input, tiptap);

    const {map, start: tableStart} = currentTable(tiptap);
    const lastCellPosition = tableStart + map.map[map.map.length - 1];
    const lastCell = tiptap.state.doc.nodeAt(lastCellPosition)!;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      lastCellPosition + lastCell.nodeSize - 2
    )));

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab'
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(currentTable(tiptap).map.height).toBe(map.height + 1);
    expect(tiptap.state.selection.$from.node(-2).type.name).toBe('tableRow');
    expect(tiptap.state.selection.$from.node(-2)).toBe(currentTable(tiptap).table.lastChild);
    expectSingleTerminalParagraph(input, tiptap);
  });

  test('inserts a table into a completely empty editor in one stable transaction', async() => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    let documentTransactions = 0;
    tiptap.on('transaction', ({transaction}) => {
      if(transaction.docChanged) ++documentTransactions;
    });

    expect(editor.insertTable()).toBe(true);
    expect(Array.from({length: tiptap.state.doc.childCount}, (_value, index) => (
      tiptap.state.doc.child(index).type.name
    ))).toEqual(['chatTableWrapper', 'paragraph']);
    expect(editor.isEmpty()).toBe(true);
    expect(editor.isPlaceholderEmpty()).toBe(false);
    expect(editor.getRichValue().value).toEqual(expect.any(String));
    expect(tiptap.view.dom.querySelector('td.chat-input-table-active-cell')).toBeNull();
    expect(tiptap.view.dom.querySelector('.chat-input-table-active-cell-frame')).not.toBeNull();
    const inserted = tiptap.state.doc.toJSON();

    await Promise.resolve();
    await Promise.resolve();
    expect(tiptap.state.doc.toJSON()).toEqual(inserted);
    expect(documentTransactions).toBe(1);

    expect(editor.undo()).toBe(true);
    expect(tiptap.state.doc.childCount).toBe(1);
    expect(tiptap.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(editor.redo()).toBe(true);
    expect(tiptap.state.doc.toJSON()).toEqual(inserted);

    expect(editor.setTableTitle('Only a title')).toBe(true);
    expect(editor.getTableTitle()).toBe('Only a title');
    expect(editor.getDocument().content?.[0].content?.[0].content?.[0].text).toBe('Only a title');
    expect(editor.isEmpty()).toBe(false);
    expect(editor.getRichMessage().input.blocks).toMatchObject([{
      _: 'pageBlockTable',
      title: {_: 'textPlain', text: 'Only a title'}
    }]);
  });

  test('reports table insertability after every editor-state transition', async() => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const onStateChange = vi.fn();
    const editor = createChatInputEditor(input, {onStateChange});
    editors.push(editor);
    const tiptap = (editor as TiptapEditorInternals).editor;

    expect(editor.canInsertTable()).toBe(true);

    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: {language: null},
        content: [{type: 'text', text: 'const answer = 42;'}]
      }]
    })).toBe(true);
    await Promise.resolve();
    expect(onStateChange).toHaveBeenCalled();
    expect(editor.canInsertTable()).toBe(false);

    expect(editor.setDocument(tableDocument([['Cell']], false))).toBe(true);
    const {map, start} = currentTable(tiptap);
    onStateChange.mockClear();
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      start + map.map[0] + 2
    )));
    await Promise.resolve();
    expect(onStateChange).toHaveBeenCalledOnce();
    expect(editor.canInsertTable()).toBe(false);

    const trailing = tiptap.state.doc.lastChild!;
    const trailingPosition = tiptap.state.doc.content.size - trailing.nodeSize + 1;
    onStateChange.mockClear();
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      trailingPosition
    )));
    await Promise.resolve();
    expect(onStateChange).toHaveBeenCalledOnce();
    expect(editor.canInsertTable()).toBe(true);
  });

  test('moves selected inline atoms into the first table cell through their text fallback', () => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'customEmoji',
          attrs: {
            documentId: '42',
            emoji: '🔥'
          }
        }, {
          type: 'inlineMath',
          attrs: {source: 'x^2'}
        }]
      }]
    })).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc,
      1,
      3
    )));

    expect(editor.insertTable()).toBe(true);
    expect(currentTable(tiptap).table.firstChild?.firstChild?.textContent).toBe('🔥x^2');
    expect(tiptap.state.doc.textContent).not.toContain('\ufffc');
  });
});
