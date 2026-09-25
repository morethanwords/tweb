import type {
  Attrs,
  AttributeSpec,
  Node as ProseMirrorNode,
  NodeSpec
} from '@tiptap/pm/model';
import {Schema} from '@tiptap/pm/model';
import {AllSelection, EditorState, TextSelection} from '@tiptap/pm/state';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import {
  canToggleChatInputTableHeaderCell,
  deleteChatInputTable,
  getChatInputTableCellAttr,
  getChatInputTableMoveTargets,
  getChatInputTableSelection,
  moveChatInputTableAxisRange,
  moveChatInputTableSelection,
  normalizeExternalChatInputTableSelectAll,
  progressiveSelectAllInChatInputTable,
  selectChatInputTableAxis,
  selectChatInputTableRect,
  setChatInputTableCellAttr,
  toggleChatInputTableBooleanAttr,
  toggleChatInputTableHeaderCell
} from '@components/chat/inputEditor/tableCommands';

const cellAttrs: Record<string, AttributeSpec> = {
  align: {default: null},
  colspan: {default: 1},
  colwidth: {default: null},
  rowspan: {default: 1},
  verticalAlign: {default: null}
};

const nodes: Record<string, NodeSpec> = {
  doc: {content: 'block+'},
  paragraph: {
    content: 'text*',
    group: 'block'
  },
  table: {
    attrs: {
      bordered: {default: true},
      striped: {default: false},
      title: {default: ''}
    },
    content: 'tableRow+',
    group: 'block',
    isolating: true,
    tableRole: 'table'
  },
  tableRow: {
    content: '(tableCell | tableHeader)+',
    tableRole: 'row'
  },
  tableCell: {
    attrs: cellAttrs,
    content: 'paragraph+',
    isolating: true,
    tableRole: 'cell'
  },
  tableHeader: {
    attrs: cellAttrs,
    content: 'paragraph+',
    isolating: true,
    tableRole: 'header_cell'
  },
  tableTitle: {
    content: 'text*'
  },
  tableWrapper: {
    content: 'tableTitle table',
    group: 'block',
    isolating: true
  },
  text: {group: 'inline'}
};

const schema = new Schema({nodes});

type CellInput = string | {
  attrs?: Attrs,
  header?: boolean,
  text: string
};

function createCell(input: CellInput) {
  const options = typeof input === 'string' ? {text: input} : input;
  const type = options.header ? schema.nodes.tableHeader : schema.nodes.tableCell;
  return type.create(
    options.attrs,
    schema.nodes.paragraph.create(
      undefined,
      options.text ? schema.text(options.text) : undefined
    )
  );
}

function createTable(rows: CellInput[][], attrs: Attrs = {}) {
  return schema.nodes.table.create(
    attrs,
    rows.map((row) => schema.nodes.tableRow.create(
      undefined,
      row.map(createCell)
    ))
  );
}

function createState(table: ProseMirrorNode, withParagraph = true) {
  return EditorState.create({
    doc: schema.nodes.doc.create(
      undefined,
      withParagraph ? [table, schema.nodes.paragraph.create()] : [table]
    )
  });
}

function createWrappedState(table: ProseMirrorNode) {
  const title = schema.nodes.tableTitle.create();
  return {
    state: EditorState.create({
      doc: schema.nodes.doc.create(undefined, [
        schema.nodes.tableWrapper.create(undefined, [title, table]),
        schema.nodes.paragraph.create()
      ])
    }),
    tablePos: 1 + title.nodeSize
  };
}

function cellPositions(state: EditorState, tablePos = 0) {
  const table = state.doc.nodeAt(tablePos)!;
  const start = tablePos + 1;
  const map = TableMap.get(table);
  return {
    map,
    positions: map.map.map((position) => start + position)
  };
}

function selectCellText(state: EditorState, position: number) {
  return state.apply(state.tr.setSelection(TextSelection.create(
    state.doc,
    position + 2
  )));
}

function tableText(state: EditorState) {
  return tableTextAt(state, 0);
}

function tableTextAt(state: EditorState, tablePos: number) {
  const table = state.doc.nodeAt(tablePos)!;
  return Array.from({length: table.childCount}, (_, row) => (
    Array.from({length: table.child(row).childCount}, (_, column) => (
      table.child(row).child(column).textContent
    ))
  ));
}

function selectDocumentText(state: EditorState) {
  const start = TextSelection.atStart(state.doc);
  const end = TextSelection.atEnd(state.doc);
  return state.apply(state.tr.setSelection(TextSelection.create(
    state.doc,
    start.from,
    end.to
  )));
}

function normalizeExternalSelectAll(oldState: EditorState) {
  let state = selectDocumentText(oldState);
  const transaction = normalizeExternalChatInputTableSelectAll(oldState, state);
  if(transaction) state = state.apply(transaction);
  return state;
}

describe('chat input table commands', () => {
  test('progressively selects cell text, the table and the whole document', () => {
    let state = createState(createTable([
      ['Alpha', 'Beta'],
      ['Gamma', 'Delta']
    ]));
    const {positions} = cellPositions(state);
    state = selectCellText(state, positions[0]);

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(state.selection).toBeInstanceOf(TextSelection);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('Alpha');

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(state.selection).toBeInstanceOf(CellSelection);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('table');

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(state.selection).toBeInstanceOf(AllSelection);
  });

  test('expands partial cell selections and skips an empty cell text step', () => {
    let state = createState(createTable([
      ['', 'Beta'],
      ['Gamma', 'Delta']
    ]));
    const {positions} = cellPositions(state);
    state = selectCellText(state, positions[0]);

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('table');

    state = selectCellText(state, positions[1]);
    expect(selectChatInputTableRect(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      {bottom: 1, left: 1, right: 2, top: 0}
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('cell');

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('table');
  });

  test('leaves select-all outside tables to the editor base keymap', () => {
    let state = createState(createTable([['Alpha']]));
    state = state.apply(state.tr.setSelection(TextSelection.create(
      state.doc,
      state.doc.content.size - 1
    )));
    const selection = state.selection;

    expect(progressiveSelectAllInChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(false);
    expect(state.selection.eq(selection)).toBe(true);
  });

  test('normalizes browser Select All through the table selection levels', () => {
    let state = createState(createTable([
      ['Alpha', 'Beta'],
      ['Gamma', 'Delta']
    ]));
    state = selectCellText(state, cellPositions(state).positions[0]);

    state = normalizeExternalSelectAll(state);
    expect(state.selection).toBeInstanceOf(TextSelection);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('Alpha');

    state = normalizeExternalSelectAll(state);
    expect(state.selection).toBeInstanceOf(CellSelection);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('table');

    state = normalizeExternalSelectAll(state);
    expect(state.selection).toBeInstanceOf(AllSelection);
  });

  test('does not normalize browser Select All outside a table', () => {
    let state = createState(createTable([['Alpha']]));
    state = state.apply(state.tr.setSelection(TextSelection.create(
      state.doc,
      state.doc.content.size - 1
    )));
    const selectedState = selectDocumentText(state);

    expect(normalizeExternalChatInputTableSelectAll(state, selectedState)).toBeUndefined();
  });

  test('describes cell, row, column and whole-table selections', () => {
    let state = createState(createTable([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]));
    const {positions} = cellPositions(state);

    state = selectCellText(state, positions[1]);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'cell',
      rect: {bottom: 1, left: 1, right: 2, top: 0}
    });

    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      1,
      2
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'row',
      rect: {bottom: 2, left: 0, right: 3, top: 1}
    });

    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'column',
      1,
      2
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'column',
      rect: {bottom: 2, left: 1, right: 2, top: 0}
    });

    expect(selectChatInputTableRect(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      {bottom: 2, left: 0, right: 3, top: 0}
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)?.kind).toBe('table');
    expect(getChatInputTableSelection(state, 0)?.cellPositions).toHaveLength(6);
  });

  test('closes a requested rectangle over merged cells', () => {
    let state = createState(createTable([
      [{attrs: {colspan: 2}, text: 'AB'}, 'C'],
      ['D', 'E', 'F']
    ]));
    state = selectCellText(state, cellPositions(state).positions[0]);

    expect(selectChatInputTableRect(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      {bottom: 1, left: 1, right: 2, top: 0}
    )).toBe(true);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'cell',
      rect: {bottom: 1, left: 0, right: 2, top: 0}
    });
  });

  test('reads and atomically sets cell alignment attributes', () => {
    let state = createState(createTable([[
      {attrs: {align: 'left'}, text: 'A'},
      {attrs: {align: 'right'}, text: 'B'}
    ]]));
    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0,
      1
    )).toBe(true);

    expect(getChatInputTableCellAttr(state, 0, 'align')).toEqual({
      isUniform: false,
      value: 'left'
    });
    expect(setChatInputTableCellAttr(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'align',
      'center'
    )).toBe(true);
    expect(getChatInputTableCellAttr(state, 0, 'align')).toEqual({
      isUniform: true,
      value: 'center'
    });
    expect(setChatInputTableCellAttr(
      state,
      undefined,
      0,
      'align',
      'center'
    )).toBe(false);
  });

  test('toggles table flags from a cell or whole-table selection', () => {
    let state = createState(createTable([
      ['A', 'B'],
      ['C', 'D']
    ]));
    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(toggleChatInputTableBooleanAttr(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'striped'
    )).toBe(true);
    expect(state.doc.firstChild?.attrs.striped).toBe(true);

    expect(selectChatInputTableRect(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      {bottom: 2, left: 0, right: 2, top: 0}
    )).toBe(true);
    expect(toggleChatInputTableBooleanAttr(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'striped'
    )).toBe(true);
    expect(state.doc.firstChild?.attrs.striped).toBe(false);
  });

  test('toggles selected cells between tableHeader and tableCell nodes', () => {
    let state = createState(createTable([[
      {header: true, text: 'A'},
      'B'
    ]]));
    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0,
      1
    )).toBe(true);
    expect(canToggleChatInputTableHeaderCell(state, 0)).toBe(true);

    expect(toggleChatInputTableHeaderCell(
      state,
      (transaction) => state = state.apply(transaction),
      0
    )).toBe(true);
    expect(state.doc.firstChild?.child(0).child(0).type.name).toBe('tableHeader');
    expect(state.doc.firstChild?.child(0).child(1).type.name).toBe('tableHeader');

    expect(toggleChatInputTableHeaderCell(
      state,
      (transaction) => state = state.apply(transaction),
      0
    )).toBe(true);
    expect(state.doc.firstChild?.child(0).child(0).type.name).toBe('tableCell');
    expect(state.doc.firstChild?.child(0).child(1).type.name).toBe('tableCell');
  });

  test('moves multiple selected rows atomically and restores their selection', () => {
    let state = createState(createTable([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['D1', 'D2']
    ]));
    state = selectCellText(state, cellPositions(state).positions[2]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      1,
      3
    )).toBe(true);
    expect(getChatInputTableMoveTargets(state, 0, 'row')).toEqual([0, 2]);

    expect(moveChatInputTableSelection(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['A1', 'A2'],
      ['D1', 'D2']
    ]);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'row',
      rect: {bottom: 2, left: 0, right: 2, top: 0}
    });
  });

  test('moves the captured row range after the live selection changes', () => {
    let state = createState(createTable([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]));
    state = selectCellText(state, cellPositions(state).positions[5]);

    expect(moveChatInputTableAxisRange(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      1,
      2,
      0
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['A1', 'A2']
    ]);

    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(moveChatInputTableAxisRange(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0,
      2,
      1
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]);
  });

  test('moves multiple body rows across a header row without losing cells', () => {
    let state = createState(createTable([
      [
        {header: true, text: 'H1'},
        {header: true, text: 'H2'},
        {header: true, text: 'H3'}
      ],
      ['A1', 'A2', 'A3'],
      ['B1', 'B2', 'B3']
    ]));
    state = selectCellText(state, cellPositions(state).positions[8]);

    expect(moveChatInputTableAxisRange(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      1,
      2,
      0
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['A1', 'A2', 'A3'],
      ['B1', 'B2', 'B3'],
      ['H1', 'H2', 'H3']
    ]);
  });

  test('moves a selected row in both directions inside the editor table wrapper', () => {
    const wrapped = createWrappedState(createTable([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]));
    let {state} = wrapped;
    const {tablePos} = wrapped;
    state = selectCellText(state, cellPositions(state, tablePos).positions[2]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      tablePos,
      'row',
      1,
      2
    )).toBe(true);

    expect(moveChatInputTableSelection(
      state,
      (transaction) => state = state.apply(transaction),
      tablePos,
      'row',
      0
    )).toBe(true);
    expect(tableTextAt(state, tablePos)).toEqual([
      ['B1', 'B2'],
      ['A1', 'A2'],
      ['C1', 'C2']
    ]);

    expect(moveChatInputTableSelection(
      state,
      (transaction) => state = state.apply(transaction),
      tablePos,
      'row',
      1
    )).toBe(true);
    expect(tableTextAt(state, tablePos)).toEqual([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2']
    ]);
  });

  test('moves rows across the default header row', () => {
    let state = createState(createTable([
      [
        {header: true, text: 'H1'},
        {header: true, text: 'H2'}
      ],
      ['A1', 'A2'],
      ['B1', 'B2']
    ]));
    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0,
      1
    )).toBe(true);
    expect(moveChatInputTableSelection(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      1
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['A1', 'A2'],
      ['H1', 'H2'],
      ['B1', 'B2']
    ]);
    expect(state.doc.firstChild?.child(0).firstChild?.type.name).toBe('tableCell');
    expect(state.doc.firstChild?.child(1).firstChild?.type.name).toBe('tableHeader');
  });

  test('moves an empty first header row down as a complete row', () => {
    let state = createState(createTable([
      [
        {header: true, text: ''},
        {header: true, text: ''}
      ],
      ['', ''],
      ['', '']
    ]));

    expect(moveChatInputTableAxisRange(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      0,
      1,
      1
    )).toBe(true);
    expect(state.doc.firstChild?.child(0).firstChild?.type.name).toBe('tableCell');
    expect(state.doc.firstChild?.child(1).firstChild?.type.name).toBe('tableHeader');
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'row',
      rect: {bottom: 2, left: 0, right: 2, top: 1}
    });
  });

  test('moves multiple selected columns atomically and restores their selection', () => {
    let state = createState(createTable([
      ['A', 'B', 'C'],
      ['D', 'E', 'F']
    ]));
    state = selectCellText(state, cellPositions(state).positions[0]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'column',
      0,
      2
    )).toBe(true);
    expect(getChatInputTableMoveTargets(state, 0, 'column')).toEqual([1]);

    expect(moveChatInputTableSelection(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'column',
      1
    )).toBe(true);
    expect(tableText(state)).toEqual([
      ['C', 'A', 'B'],
      ['F', 'D', 'E']
    ]);
    expect(getChatInputTableSelection(state, 0)).toMatchObject({
      kind: 'column',
      rect: {bottom: 2, left: 1, right: 3, top: 0}
    });
  });

  test('excludes move targets that cut through rowspan or colspan', () => {
    let state = createState(createTable([
      [{attrs: {rowspan: 2}, text: 'A'}, 'B'],
      ['C'],
      ['D', 'E'],
      ['F', 'G']
    ]));
    const {map, positions} = cellPositions(state);
    state = selectCellText(state, positions[map.width * 3]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'row',
      3,
      4
    )).toBe(true);
    expect(getChatInputTableMoveTargets(state, 0, 'row')).toEqual([0, 2]);

    state = createState(createTable([
      [{attrs: {colspan: 2}, text: 'AB'}, 'C', 'D'],
      ['E', 'F', 'G', 'H']
    ]));
    const columnPositions = cellPositions(state).positions;
    state = selectCellText(state, columnPositions[3]);
    expect(selectChatInputTableAxis(
      state,
      (transaction) => state = state.apply(transaction),
      0,
      'column',
      3,
      4
    )).toBe(true);
    expect(getChatInputTableMoveTargets(state, 0, 'column')).toEqual([0, 2]);
  });

  test('deletes a top-level table and keeps the document schema valid', () => {
    let state = createState(createTable([['A']]), false);
    state = selectCellText(state, cellPositions(state).positions[0]);

    expect(deleteChatInputTable(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.firstChild?.type.name).toBe('paragraph');
  });
});
