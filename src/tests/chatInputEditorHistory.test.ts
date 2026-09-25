import {redoNoScroll, history, undoNoScroll} from '@tiptap/pm/history';
import {Fragment, Schema} from '@tiptap/pm/model';
import {AllSelection, EditorState, NodeSelection, TextSelection, type Transaction} from '@tiptap/pm/state';
import {CellSelection, TableMap, tableNodes} from '@tiptap/pm/tables';
import type {EditorView} from '@tiptap/pm/view';
import runHistoryCommandPreservingSelection, {
  CHAT_INPUT_HISTORY_NEW_GROUP_DELAY
} from '@components/chat/inputEditor/history';

function createView(state: EditorState) {
  let currentState = state;
  const focus = vi.fn();
  const view: Pick<EditorView, 'dispatch' | 'focus' | 'state'> = {
    dispatch: (transaction: Transaction) => currentState = currentState.apply(transaction),
    focus,
    get state() {
      return currentState;
    }
  };
  return {focus, view};
}

const textSchema = new Schema({
  nodes: {
    doc: {content: 'paragraph+'},
    paragraph: {content: 'text*'},
    text: {inline: true}
  }
});

const tableSchema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    paragraph: {
      content: 'text*',
      group: 'block'
    },
    ...tableNodes({
      cellAttributes: {},
      cellContent: 'paragraph+',
      tableGroup: 'block'
    }),
    text: {inline: true}
  }
});

function tableCell(text: string) {
  return tableSchema.nodes.table_cell.create(
    undefined,
    tableSchema.nodes.paragraph.create(undefined, tableSchema.text(text))
  );
}

function selectedCellTexts(selection: CellSelection) {
  const texts: string[] = [];
  selection.forEachCell((cell) => texts.push(cell.textContent));
  return texts;
}

function rowSelection(state: EditorState, row: number) {
  const table = state.doc.firstChild!;
  const map = TableMap.get(table);
  const start = 1;
  return CellSelection.rowSelection(
    state.doc.resolve(start + map.positionAt(row, 0, table)),
    state.doc.resolve(start + map.positionAt(row, map.width - 1, table))
  );
}

describe('chat input history selection', () => {
  test('undoes consecutive keyboard input one transaction at a time', () => {
    const state = EditorState.create({
      doc: textSchema.nodes.doc.create(undefined, [
        textSchema.nodes.paragraph.create()
      ]),
      plugins: [history({newGroupDelay: CHAT_INPUT_HISTORY_NEW_GROUP_DELAY})]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.insertText('a', 1).setTime(1000));
    view.dispatch(view.state.tr.insertText('b', 2).setTime(1002));

    expect(view.state.doc.textContent).toBe('ab');
    expect(undoNoScroll(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.textContent).toBe('a');
    expect(undoNoScroll(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.textContent).toBe('');
  });

  test('maps the current text selection through undo and redo', () => {
    const state = EditorState.create({
      doc: textSchema.nodes.doc.create(undefined, [
        textSchema.nodes.paragraph.create(undefined, textSchema.text('history'))
      ]),
      plugins: [history()]
    });
    const {focus, view} = createView(state);
    view.dispatch(view.state.tr.insertText('!', 8));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 5)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.doc.textContent).toBe('history');
    expect(view.state.selection).toMatchObject({from: 2, to: 5});

    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.doc.textContent).toBe('history!');
    expect(view.state.selection).toMatchObject({from: 2, to: 5});
    expect(focus).toHaveBeenCalledTimes(2);
  });

  test('keeps Select All active when undo and redo change document size', () => {
    const state = EditorState.create({
      doc: textSchema.nodes.doc.create(undefined, [
        textSchema.nodes.paragraph.create(undefined, textSchema.text('before'))
      ]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.insertText('!', 7));
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.doc.textContent).toBe('before');
    expect(view.state.selection).toBeInstanceOf(AllSelection);
    expect(view.state.selection.to).toBe(view.state.doc.content.size);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.doc.textContent).toBe('before!');
    expect(view.state.selection).toBeInstanceOf(AllSelection);
    expect(view.state.selection.to).toBe(view.state.doc.content.size);
  });

  test('keeps a selected node when undo restores an equal-type node before it', () => {
    const alpha = textSchema.nodes.paragraph.create(undefined, textSchema.text('Alpha'));
    const beta = textSchema.nodes.paragraph.create(undefined, textSchema.text('Beta'));
    const state = EditorState.create({
      doc: textSchema.nodes.doc.create(undefined, [alpha, beta]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.delete(0, alpha.nodeSize));
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.textContent).toBe('Beta');
    expect(view.state.selection.from).toBe(alpha.nodeSize);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect((view.state.selection as NodeSelection).node.textContent).toBe('Beta');
    expect(view.state.selection.from).toBe(0);
  });

  test('does not select the next same-type node when undo removes the selected insertion', () => {
    const alpha = textSchema.nodes.paragraph.create(undefined, textSchema.text('Alpha'));
    const beta = textSchema.nodes.paragraph.create(undefined, textSchema.text('Beta'));
    const gamma = textSchema.nodes.paragraph.create(undefined, textSchema.text('Gamma'));
    const state = EditorState.create({
      doc: textSchema.nodes.doc.create(undefined, [alpha, gamma]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.insert(alpha.nodeSize, beta));
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, alpha.nodeSize)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toEqual(state.selection);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.textContent).toBe('Beta');
  });

  test('keeps a selected table cell when undo restores a preceding paragraph', () => {
    const prefix = tableSchema.nodes.paragraph.create(undefined, tableSchema.text('Prefix'));
    const table = tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell('A'), tableCell('B')])
    ]);
    const state = EditorState.create({
      doc: tableSchema.nodes.doc.create(undefined, [prefix, table]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.delete(0, prefix.nodeSize));
    const cellPosition = 1 + TableMap.get(table).map[1];
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPosition)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(prefix.nodeSize + cellPosition);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['B']);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(cellPosition);
  });

  test('does not transfer selection into an adjacent table when undo removes the selected table', () => {
    const table = (value: string) => tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell(value)])
    ]);
    const alpha = table('Alpha');
    const beta = table('Beta');
    const gamma = table('Gamma');
    const state = EditorState.create({
      doc: tableSchema.nodes.doc.create(undefined, [alpha, gamma]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.insert(alpha.nodeSize, beta));
    view.dispatch(view.state.tr.setSelection(CellSelection.create(
      view.state.doc,
      alpha.nodeSize + 1 + TableMap.get(beta).map[0]
    )));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toEqual(state.selection);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['Beta']);
  });

  test('keeps a CellSelection when history changes content before the table', () => {
    const table = tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell('A'), tableCell('B')]),
      tableSchema.nodes.table_row.create(undefined, [tableCell('C'), tableCell('D')])
    ]);
    const state = EditorState.create({
      doc: tableSchema.nodes.doc.create(undefined, [
        tableSchema.nodes.paragraph.create(undefined, tableSchema.text('prefix')),
        table
      ]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.insertText('!', 7));

    const tablePosition = view.state.doc.child(0).nodeSize;
    const currentTable = view.state.doc.nodeAt(tablePosition)!;
    const map = TableMap.get(currentTable);
    const tableStart = tablePosition + 1;
    view.dispatch(view.state.tr.setSelection(CellSelection.create(
      view.state.doc,
      tableStart + map.map[0],
      tableStart + map.map[1]
    )));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['A', 'B']);

    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['A', 'B']);
  });

  test.each([false, true])('preserves equal table cells with backward range=%s through undo and redo', (backward) => {
    const table = tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell('Same'), tableCell('Same')]),
      tableSchema.nodes.table_row.create(undefined, [tableCell('Same'), tableCell('Same')])
    ]);
    const doc = tableSchema.nodes.doc.create(undefined, [
      tableSchema.nodes.paragraph.create(undefined, tableSchema.text('before')),
      table
    ]);
    const state = EditorState.create({doc, plugins: [history()]});
    const {view} = createView(state);
    const replacement = tableSchema.nodeFromJSON(table.toJSON());
    const extendedTable = replacement.copy(replacement.content.append(Fragment.from(
      tableSchema.nodes.table_row.create(undefined, [tableCell('New'), tableCell('New')])
    )));
    const tablePosition = doc.firstChild!.nodeSize;
    view.dispatch(view.state.tr.replaceWith(tablePosition, tablePosition + table.nodeSize, extendedTable));
    const tableStart = view.state.doc.firstChild!.nodeSize + 1;
    const map = TableMap.get(view.state.doc.lastChild!);
    view.dispatch(view.state.tr.setSelection(CellSelection.create(
      view.state.doc,
      tableStart + map.positionAt(1, 1, view.state.doc.lastChild!),
      tableStart + map.positionAt(backward ? 0 : 1, backward ? 0 : 1, view.state.doc.lastChild!)
    )));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.doc.eq(doc)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    const selection = view.state.selection as CellSelection;
    expect(selection.$anchorCell.pos).toBe(doc.firstChild!.nodeSize + 1 + map.positionAt(1, 1, table));
    const headPosition = doc.firstChild!.nodeSize + 1 + map.positionAt(backward ? 0 : 1, backward ? 0 : 1, table);
    expect(selection.$headCell.pos).toBe(headPosition);

    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.doc.lastChild?.eq(extendedTable)).toBe(true);
    const redoneSelection = view.state.selection as CellSelection;
    expect(redoneSelection).toBeInstanceOf(CellSelection);
    expect(redoneSelection.$anchorCell.pos).toBe(selection.$anchorCell.pos);
    expect(redoneSelection.$headCell.pos).toBe(headPosition);
  });

  test('does not retarget an edited selected cell to an equal neighbor during undo', () => {
    const table = tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell('A'), tableCell('B')])
    ]);
    const state = EditorState.create({
      doc: tableSchema.nodes.doc.create(undefined, [table]),
      plugins: [history()]
    });
    const {view} = createView(state);
    const cellPosition = 1 + TableMap.get(table).map[1];
    view.dispatch(view.state.tr.insertText('A', cellPosition + 2, cellPosition + 3));
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPosition)));

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(cellPosition);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['B']);
    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect((view.state.selection as CellSelection).$anchorCell.pos).toBe(cellPosition);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['A']);
  });

  test('keeps the moved row selected when undo replaces the whole table', () => {
    const table = tableSchema.nodes.table.create(undefined, [
      tableSchema.nodes.table_row.create(undefined, [tableCell('H1'), tableCell('H2')]),
      tableSchema.nodes.table_row.create(undefined, [tableCell('A1'), tableCell('A2')]),
      tableSchema.nodes.table_row.create(undefined, [tableCell('B1'), tableCell('B2')])
    ]);
    const state = EditorState.create({
      doc: tableSchema.nodes.doc.create(undefined, [table]),
      plugins: [history()]
    });
    const {view} = createView(state);
    view.dispatch(view.state.tr.setSelection(rowSelection(view.state, 0)));

    const rows = [table.child(1), table.child(0), table.child(2)];
    const movedTable = table.type.createChecked(table.attrs, rows, table.marks);
    const moveTransaction = view.state.tr.replaceWith(0, table.nodeSize, movedTable);
    moveTransaction.setSelection(rowSelection(
      view.state.apply(moveTransaction),
      1
    ));
    view.dispatch(moveTransaction);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['H1', 'H2']);

    expect(runHistoryCommandPreservingSelection(view, undoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['H1', 'H2']);
    expect(view.state.selection).toEqual(rowSelection(view.state, 0));

    expect(runHistoryCommandPreservingSelection(view, redoNoScroll)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedCellTexts(view.state.selection as CellSelection)).toEqual(['H1', 'H2']);
    expect(view.state.selection).toEqual(rowSelection(view.state, 1));
  });
});
