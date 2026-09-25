import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {Plugin, Selection, TextSelection} from '@tiptap/pm/state';
import {CellSelection, TableMap} from '@tiptap/pm/tables';
import {type EditorView} from '@tiptap/pm/view';
import {
  deleteChatInputTable,
  getChatInputTableSelection,
  selectChatInputTableRect
} from '@components/chat/inputEditor/tableCommands';
import {CHAT_TABLE_TITLE_NODE_NAME, CHAT_TABLE_WRAPPER_NODE_NAME} from '@components/chat/inputEditor/tableSchema';
import {adjacentTopLevelTable, selectionIsAtVisualTextblockEdge} from '@components/chat/inputEditor/extensions/navigation';

export function tableCellContext(state: EditorState) {
  const {selection} = state;
  let $cell = selection instanceof CellSelection ? selection.$headCell : undefined;
  let cellDepth = -1;

  if(!$cell) {
    const {$from} = selection;
    for(let depth = $from.depth; depth > 0; --depth) {
      const name = $from.node(depth).type.name;
      if(name !== 'tableCell' && name !== 'tableHeader') continue;
      cellDepth = depth;
      $cell = state.doc.resolve($from.before(depth));
      break;
    }
  }

  if(!$cell) return;
  const table = $cell.node(-1);
  if(table.type.name !== 'table') return;
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const relativeCellPosition = $cell.pos - tableStart;
  const rect = map.findCell(relativeCellPosition);
  return {$cell, cellDepth, map, rect, table, tableStart};
}

function selectionIsAtCellContentEnd(state: EditorState, cellDepth: number) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;
  const {$from} = selection;
  if(!$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return false;

  for(let depth = $from.depth; depth >= cellDepth; --depth) {
    if($from.indexAfter(depth) !== $from.node(depth).childCount) return false;
  }
  return true;
}

function selectionIsAtCellContentStart(state: EditorState, cellDepth: number) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;
  const {$from} = selection;
  if(!$from.parent.isTextblock || $from.parentOffset !== 0) return false;

  for(let depth = $from.depth; depth >= cellDepth; --depth) {
    if($from.index(depth) !== 0) return false;
  }
  return true;
}

function isEmptyTableCell(cell?: ProseMirrorNode | null) {
  return cell?.childCount === 1 &&
    cell.firstChild?.type.name === 'paragraph' &&
    cell.firstChild.content.size === 0;
}

function tableCellPositions(table: ProseMirrorNode, tableStart: number) {
  const positions: number[] = [];
  TableMap.get(table).map.forEach((position) => {
    const absolute = tableStart + position;
    if(!positions.includes(absolute)) positions.push(absolute);
  });
  return positions;
}

function tableCellPositionAt(
  map: TableMap,
  row: number,
  column: number
) {
  return map.map[row * map.width + column];
}

function chatTableOuterRange(
  state: EditorState,
  tablePosition: number,
  table: ProseMirrorNode
) {
  const $table = state.doc.resolve(tablePosition);
  if(
    $table.depth > 0 &&
    $table.parent.type.name === CHAT_TABLE_WRAPPER_NODE_NAME &&
    $table.nodeAfter === table
  ) {
    const wrapperPosition = $table.before($table.depth);
    return {
      after: wrapperPosition + $table.parent.nodeSize,
      before: wrapperPosition
    };
  }
  return {
    after: tablePosition + table.nodeSize,
    before: tablePosition
  };
}

function moveSelectionToTableCell(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  tableStart: number,
  table: ProseMirrorNode,
  index: number,
  atEnd = false
) {
  const positions = tableCellPositions(table, tableStart);
  const position = positions[index < 0 ? positions.length + index : index];
  if(position === undefined) return false;
  const cell = state.doc.nodeAt(position);
  if(!cell) return false;
  const selection = TextSelection.findFrom(
    state.doc.resolve(atEnd ? position + cell.nodeSize - 1 : position + 1),
    atEnd ? -1 : 1,
    true
  );
  if(!selection) return false;
  if(dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function moveSelectionBeforeTable(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  tablePosition: number
) {
  const table = state.doc.nodeAt(tablePosition);
  if(!table?.type.spec.tableRole) return false;
  const before = chatTableOuterRange(state, tablePosition, table).before;
  const selection = Selection.near(state.doc.resolve(before), -1);
  if(selection.to <= before) {
    if(dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
  }

  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  if(!paragraph) return false;
  if(dispatch) {
    const transaction = state.tr.insert(before, paragraph);
    dispatch(transaction.setSelection(
      TextSelection.create(transaction.doc, before + 1)
    ).scrollIntoView());
  }
  return true;
}

function moveSelectionAfterTable(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  tableStart: number,
  table: ProseMirrorNode
) {
  const tablePosition = tableStart - 1;
  const after = chatTableOuterRange(state, tablePosition, table).after;
  const selection = Selection.near(state.doc.resolve(after), 1);
  if(selection.from >= after) {
    if(dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
  }

  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  if(!paragraph) return false;
  if(dispatch) {
    const transaction = state.tr.insert(after, paragraph);
    dispatch(transaction.setSelection(
      TextSelection.create(transaction.doc, after + 1)
    ).scrollIntoView());
  }
  return true;
}

function focusTableTitle(view: EditorView, tablePosition: number, atEnd = false) {
  const $table = view.state.doc.resolve(tablePosition);
  const wrapper = $table.parent;
  const title = wrapper.type.name === CHAT_TABLE_WRAPPER_NODE_NAME ?
    wrapper.firstChild :
    undefined;
  if(
    !title ||
    title.type.name !== CHAT_TABLE_TITLE_NODE_NAME ||
    !$table.depth
  ) return false;
  const titlePosition = $table.before($table.depth) + 1;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(
    view.state.doc,
    titlePosition + 1 + (atEnd ? title.content.size : 0)
  )).scrollIntoView());
  view.focus();
  return true;
}

function tableTitleContext(state: EditorState) {
  const {$from} = state.selection;
  for(let depth = $from.depth; depth > 0; --depth) {
    const title = $from.node(depth);
    if(title.type.name !== CHAT_TABLE_TITLE_NODE_NAME) continue;
    const wrapperDepth = depth - 1;
    const wrapper = $from.node(wrapperDepth);
    const table = wrapper.type.name === CHAT_TABLE_WRAPPER_NODE_NAME ?
      wrapper.lastChild :
      undefined;
    if(table?.type.spec.tableRole !== 'table') return;
    const wrapperPosition = $from.before(wrapperDepth);
    const tablePosition = wrapperPosition + 1 + title.nodeSize;
    return {table, tablePosition};
  }
}

function selectTableTextblockOnTripleClick(view: EditorView, position: number) {
  const resolved = view.state.doc.resolve(position);
  let cellDepth = -1;
  for(let depth = resolved.depth; depth > 0; --depth) {
    if(resolved.node(depth).type.spec.tableRole === 'cell' ||
      resolved.node(depth).type.spec.tableRole === 'header_cell') {
      cellDepth = depth;
      break;
    }
  }
  if(cellDepth < 0) return false;

  for(let depth = resolved.depth; depth > cellDepth; --depth) {
    const node = resolved.node(depth);
    if(!node.inlineContent) continue;
    if(!node.content.size) return false;
    const from = resolved.before(depth) + 1;
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, from, from + node.content.size)
    ).setMeta('pointer', true));
    return true;
  }
  return false;
}

export function tableHasRtlDirection(view: EditorView, tablePosition: number) {
  const node = view.nodeDOM(tablePosition);
  if(!(node instanceof globalThis.Element)) return false;
  const table = node.matches('table') ?
    node :
    node.querySelector('table') || node;
  return table.ownerDocument.defaultView?.getComputedStyle(table).direction === 'rtl';
}

export const ChatTableNavigation = Extension.create({
  name: 'chatTableNavigation',
  priority: 1200,

  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleTripleClick: (view, position) => (
          selectTableTextblockOnTripleClick(view, position)
        ),
        handleDOMEvents: {
          keydown: (view, event) => {
            if(event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
            const context = tableCellContext(view.state);
            if(!context) return false;
            const {cellDepth, map, rect, tableStart} = context;
            if(
              rect.bottom !== map.height ||
              rect.right !== map.width ||
              !selectionIsAtCellContentEnd(view.state, cellDepth)
            ) return false;

            const direction = event.key === 'ArrowLeft' ? 'left' : 'right';
            if(
              tableHasRtlDirection(view, tableStart - 1) ===
              (direction === 'left')
            ) return false;

            // Stop ProseMirror Tables from treating the opposite visual
            // arrow as an exit. Do not preventDefault: the browser must keep
            // its native bidi/grapheme-aware caret movement inside the cell.
            return true;
          }
        }
      }
    })];
  },

  addKeyboardShortcuts() {
    const deleteSelectedTable = () => {
      const {state, view} = this.editor;
      const {selection} = state;
      if(!(selection instanceof CellSelection)) return false;
      const tablePosition = selection.$anchorCell.start(-1) - 1;
      if(getChatInputTableSelection(state, tablePosition)?.kind !== 'table') return false;
      return deleteChatInputTable(
        state,
        (transaction) => view.dispatch(transaction)
      );
    };
    const moveAfterTableWithInlineArrow = (direction: 'left' | 'right') => {
      const {state, view} = this.editor;
      const context = tableCellContext(state);
      if(!context) return false;
      const {cellDepth, map, rect, table, tableStart} = context;
      if(
        rect.bottom !== map.height ||
        rect.right !== map.width ||
        !selectionIsAtCellContentEnd(state, cellDepth)
      ) return false;
      if(
        tableHasRtlDirection(view, tableStart - 1) !== (direction === 'left')
      ) return false;
      return moveSelectionAfterTable(
        state,
        (transaction) => view.dispatch(transaction),
        tableStart,
        table
      );
    };
    const moveIntoPreviousTableWithInlineArrow = (direction: 'left' | 'right') => {
      const {state, view} = this.editor;
      const adjacent = adjacentTopLevelTable(state, -1);
      if(!adjacent) return false;
      if(
        tableHasRtlDirection(view, adjacent.tablePosition) !==
        (direction === 'right')
      ) return false;
      return moveSelectionToTableCell(
        state,
        (transaction) => view.dispatch(transaction),
        adjacent.tablePosition + 1,
        adjacent.table,
        -1,
        true
      );
    };
    const moveToPreviousCellFromEmptyCell = () => {
      const {state, view} = this.editor;
      const context = tableCellContext(state);
      if(
        !context ||
        context.cellDepth < 0 ||
        !selectionIsAtCellContentStart(state, context.cellDepth) ||
        !isEmptyTableCell(state.doc.nodeAt(context.$cell.pos))
      ) return false;

      const positions = tableCellPositions(context.table, context.tableStart);
      const index = positions.indexOf(context.$cell.pos);
      if(index < 0) return false;
      if(index === 0) return focusTableTitle(view, context.tableStart - 1, true);
      return moveSelectionToTableCell(
        state,
        (transaction) => view.dispatch(transaction),
        context.tableStart,
        context.table,
        index - 1,
        true
      );
    };
    const selectTableFromEmptyTitle = () => {
      const {state, view} = this.editor;
      const {selection} = state;
      const context = tableTitleContext(state);
      if(
        !context ||
        !(selection instanceof TextSelection) ||
        !selection.empty ||
        selection.$from.parent.type.name !== CHAT_TABLE_TITLE_NODE_NAME ||
        selection.$from.parent.content.size !== 0
      ) return false;

      const map = TableMap.get(context.table);
      return selectChatInputTableRect(
        state,
        (transaction) => view.dispatch(transaction),
        context.tablePosition,
        {bottom: map.height, left: 0, right: map.width, top: 0}
      );
    };
    const moveBeforeTableFromTitle = () => {
      const {state, view} = this.editor;
      const {selection} = state;
      const context = tableTitleContext(state);
      if(
        !context ||
        !(selection instanceof TextSelection) ||
        !selection.empty ||
        selection.$from.parent.type.name !== CHAT_TABLE_TITLE_NODE_NAME ||
        selection.$from.parentOffset !== 0 ||
        !selection.$from.parent.content.size
      ) return false;
      return moveSelectionBeforeTable(
        state,
        (transaction) => view.dispatch(transaction),
        context.tablePosition
      );
    };

    const enterTableBody = () => {
      const {state, view} = this.editor;
      const context = tableTitleContext(state);
      return !!context && moveSelectionToTableCell(
        state,
        (transaction) => view.dispatch(transaction),
        context.tablePosition + 1,
        context.table,
        0
      );
    };

    return {
      Backspace: () => (
        selectTableFromEmptyTitle() ||
        moveBeforeTableFromTitle() ||
        moveToPreviousCellFromEmptyCell() ||
        deleteSelectedTable()
      ),
      Delete: deleteSelectedTable,
      'Mod-Backspace': deleteSelectedTable,
      'Mod-Delete': deleteSelectedTable,
      ArrowDown: () => {
        const {state, view} = this.editor;
        const titleContext = tableTitleContext(state);
        if(titleContext) {
          if(!selectionIsAtVisualTextblockEdge(view, 'down')) return false;
          return moveSelectionToTableCell(
            state,
            (transaction) => view.dispatch(transaction),
            titleContext.tablePosition + 1,
            titleContext.table,
            0
          );
        }
        const context = tableCellContext(state);
        if(context) {
          const {cellDepth, map, rect, table, tableStart} = context;
          if(!selectionIsAtCellContentEnd(state, cellDepth)) return false;
          if(rect.bottom < map.height) {
            const nextPosition = tableStart + tableCellPositionAt(
              map,
              rect.bottom,
              rect.left
            );
            const nextIndex = tableCellPositions(table, tableStart)
            .indexOf(nextPosition);
            return nextIndex >= 0 && moveSelectionToTableCell(
              state,
              (transaction) => view.dispatch(transaction),
              tableStart,
              table,
              nextIndex
            );
          }
          return moveSelectionAfterTable(
            state,
            (transaction) => view.dispatch(transaction),
            tableStart,
            table
          );
        }

        const adjacent = adjacentTopLevelTable(state, 1);
        return !!adjacent && focusTableTitle(view, adjacent.tablePosition);
      },
      ArrowLeft: () => (
        moveAfterTableWithInlineArrow('left') ||
        moveIntoPreviousTableWithInlineArrow('left')
      ),
      ArrowRight: () => (
        moveAfterTableWithInlineArrow('right') ||
        moveIntoPreviousTableWithInlineArrow('right')
      ),
      ArrowUp: () => {
        const {state, view} = this.editor;
        const titleContext = tableTitleContext(state);
        if(titleContext) {
          if(!selectionIsAtVisualTextblockEdge(view, 'up')) return false;
          return moveSelectionBeforeTable(
            state,
            (transaction) => view.dispatch(transaction),
            titleContext.tablePosition
          );
        }
        const context = tableCellContext(state);
        if(context) {
          const {cellDepth, map, rect, table, tableStart} = context;
          if(!selectionIsAtCellContentStart(state, cellDepth)) return false;
          if(rect.top > 0) {
            const previousPosition = tableStart + tableCellPositionAt(
              map,
              rect.top - 1,
              rect.left
            );
            const previousIndex = tableCellPositions(table, tableStart)
            .indexOf(previousPosition);
            return previousIndex >= 0 && moveSelectionToTableCell(
              state,
              (transaction) => view.dispatch(transaction),
              tableStart,
              table,
              previousIndex,
              true
            );
          }
          return focusTableTitle(view, tableStart - 1, true);
        }

        const adjacent = adjacentTopLevelTable(state, -1);
        return !!adjacent && moveSelectionToTableCell(
          state,
          (transaction) => view.dispatch(transaction),
          adjacent.tablePosition + 1,
          adjacent.table,
          -1,
          true
        );
      },
      Enter: enterTableBody,
      Tab: enterTableBody,
      'Shift-Tab': () => {
        const {state, view} = this.editor;
        const context = tableTitleContext(state);
        return !!context && moveSelectionBeforeTable(
          state,
          (transaction) => view.dispatch(transaction),
          context.tablePosition
        );
      }
    };
  }
});
