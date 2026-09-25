import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {
  AllSelection,
  NodeSelection,
  TextSelection,
  type Command,
  type Transaction
} from '@tiptap/pm/state';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import type {EditorView} from '@tiptap/pm/view';

type TableSelectionSnapshot = {
  anchorCell: ProseMirrorNode,
  anchorColumn: number,
  anchorRow: number,
  headCell: ProseMirrorNode,
  headColumn: number,
  headRow: number,
  tablePos: number,
  tableSize: number
};

// Keep ordinary keyboard input granular like the native chat composer. IME
// composition and commands that dispatch one transaction remain atomic.
export const CHAT_INPUT_HISTORY_NEW_GROUP_DELAY = 1;

function captureTableSelection(selection: CellSelection): TableSelectionSnapshot {
  const table = selection.$anchorCell.node(-1);
  const tableStart = selection.$anchorCell.start(-1);
  const map = TableMap.get(table);
  const anchor = map.findCell(selection.$anchorCell.pos - tableStart);
  const head = map.findCell(selection.$headCell.pos - tableStart);
  return {
    anchorCell: selection.$anchorCell.nodeAfter!,
    anchorColumn: anchor.left,
    anchorRow: anchor.top,
    headCell: selection.$headCell.nodeAfter!,
    headColumn: head.left,
    headRow: head.top,
    tablePos: tableStart - 1,
    tableSize: table.nodeSize
  };
}

function findCellPosition(
  table: ProseMirrorNode,
  map: TableMap,
  cell: ProseMirrorNode
) {
  const positions = [...new Set(map.map)];
  const identical = positions.filter((position) => table.nodeAt(position) === cell);
  return identical.length === 1 ? identical[0] : undefined;
}

function restoreTableSelection(
  transaction: Transaction,
  snapshot: TableSelectionSnapshot
) {
  const tablePos = transaction.mapping.map(snapshot.tablePos, 1);
  const tableEnd = transaction.mapping.map(snapshot.tablePos + snapshot.tableSize, -1);
  if(tableEnd <= tablePos) return;
  const table = transaction.doc.nodeAt(tablePos);
  if(!table || table.type.spec.tableRole !== 'table') return;

  const map = TableMap.get(table);
  const tableStart = tablePos + 1;
  // Equal content does not identify a cell: Undo may change the selected text
  // to/from a value present elsewhere. Follow identity or preserve grid position.
  const cellPosition = (cell: ProseMirrorNode, row: number, column: number) => (
    findCellPosition(table, map, cell) ?? map.map[
      Math.min(row, map.height - 1) * map.width + Math.min(column, map.width - 1)
    ]
  );
  return CellSelection.create(
    transaction.doc,
    tableStart + cellPosition(snapshot.anchorCell, snapshot.anchorRow, snapshot.anchorColumn),
    tableStart + cellPosition(snapshot.headCell, snapshot.headRow, snapshot.headColumn)
  );
}

export default function runHistoryCommandPreservingSelection(
  view: Pick<EditorView, 'dispatch' | 'focus' | 'state'>,
  command: Command
) {
  const currentSelection = view.state.selection;
  const tableSelection = currentSelection instanceof CellSelection ?
    captureTableSelection(currentSelection) :
    undefined;
  let transaction: Transaction | undefined;
  const handled = command(
    view.state,
    (nextTransaction) => transaction = nextTransaction,
    view as EditorView
  );
  if(!handled || !transaction) return false;

  let selection = transaction.selection;
  if(currentSelection instanceof AllSelection) {
    selection = new AllSelection(transaction.doc);
  } else if(currentSelection instanceof TextSelection && !currentSelection.empty) {
    // Keep new block boundaries outside the range, including the quote's
    // closing boundary when Redo wraps the selected text again.
    const from = transaction.mapping.map(currentSelection.from, 1);
    const to = transaction.mapping.map(currentSelection.to, -1);
    selection = TextSelection.between(
      transaction.doc.resolve(currentSelection.anchor > currentSelection.head ? to : from),
      transaction.doc.resolve(currentSelection.anchor > currentSelection.head ? from : to)
    );
  } else if(currentSelection instanceof NodeSelection) {
    const mapped = transaction.mapping.mapResult(currentSelection.from, 1);
    const node = mapped.deleted ? undefined : transaction.doc.nodeAt(mapped.pos);
    selection = node?.type === currentSelection.node.type && NodeSelection.isSelectable(node) ?
      NodeSelection.create(transaction.doc, mapped.pos) :
      transaction.selection;
  }
  if(tableSelection && !(selection instanceof CellSelection)) {
    selection = restoreTableSelection(transaction, tableSelection) || selection;
  }
  transaction.setSelection(selection);
  view.dispatch(transaction);
  view.focus();
  return true;
}
