import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {Command, EditorState, Transaction} from '@tiptap/pm/state';
import {
  AllSelection,
  NodeSelection,
  Selection,
  TextSelection
} from '@tiptap/pm/state';
import {
  CellSelection,
  TableMap,
  cellAround,
  deleteTable,
  moveTableColumn,
  moveTableRow
} from '@tiptap/pm/tables';
import {CHAT_TABLE_WRAPPER_NODE_NAME} from '@components/chat/inputEditor/tableSchema';

export type ChatInputTableSelectionKind = 'cell' | 'row' | 'column' | 'table';
export type ChatInputTableMoveAxis = 'row' | 'column';
export type ChatInputTableCellAttrName = 'align' | 'verticalAlign';
export type ChatInputTableBooleanAttrName = 'bordered' | 'striped' | 'compact';

export type ChatInputTableRect = {
  bottom: number,
  left: number,
  right: number,
  top: number
};

export type ChatInputTableSelection = {
  anchorCellPos: number,
  cellPositions: number[],
  headCellPos: number,
  kind: ChatInputTableSelectionKind,
  map: TableMap,
  rect: ChatInputTableRect,
  table: ProseMirrorNode,
  tablePos: number,
  tableStart: number
};

export type ChatInputTableCellAttr = {
  isUniform: boolean,
  value: unknown
};

type Dispatch = (transaction: Transaction) => void;

type TableContext = {
  map: TableMap,
  table: ProseMirrorNode,
  tablePos: number,
  tableStart: number
};

type MoveContext = {
  count: number,
  descriptor: ChatInputTableSelection,
  dimension: number,
  fromIndex: number
};

export function getChatInputTableSelection(
  state: EditorState,
  tablePos: number
): ChatInputTableSelection | undefined {
  const context = getTableContext(state.doc, tablePos);
  if(!context) return;

  const cellRange = getSelectedCellRange(state, context);
  if(!cellRange) return;

  const {anchorCellPos, headCellPos} = cellRange;
  const rect = closeTableRect(context.map, context.map.rectBetween(
    anchorCellPos - context.tableStart,
    headCellPos - context.tableStart
  ));

  return {
    ...context,
    anchorCellPos,
    cellPositions: context.map.cellsInRect(rect).map(
      (position) => context.tableStart + position
    ),
    headCellPos,
    kind: getSelectionKind(rect, context.map),
    rect
  };
}

export function deleteChatInputTable(
  state: EditorState,
  dispatch?: Dispatch
): boolean {
  const selectedTable = getSelectedTableContainer(state);

  if(!selectedTable) return deleteTable(state, dispatch);

  if(dispatch) {
    const {from, index, parent, to} = selectedTable;
    const transaction = parent.canReplace(index, index + 1) ?
      state.tr.delete(from, to) :
      state.tr.replaceWith(from, to, state.schema.nodes.paragraph.create());
    dispatch(transaction.scrollIntoView());
  }

  return true;
}

function getSelectedTableContainer(state: EditorState) {
  const {selection} = state;
  if(selection instanceof NodeSelection) {
    if(selection.node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME) {
      return {
        depth: 0,
        from: selection.from,
        index: selection.$from.index(),
        node: selection.node,
        parent: selection.$from.parent,
        to: selection.to
      };
    }
    if(selection.node.type.spec.tableRole === 'table') {
      const {$from} = selection;
      if(
        $from.depth > 0 &&
        $from.parent.type.name === CHAT_TABLE_WRAPPER_NODE_NAME
      ) {
        const depth = $from.depth;
        return {
          depth,
          from: $from.before(depth),
          index: $from.index(depth - 1),
          node: $from.parent,
          parent: $from.node(depth - 1),
          to: $from.after(depth)
        };
      }
      return {
        depth: 0,
        from: selection.from,
        index: selection.$from.index(),
        node: selection.node,
        parent: selection.$from.parent,
        to: selection.to
      };
    }
  }
  return getAncestorTable(state);
}

export function selectChatInputTableRect(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  rect: ChatInputTableRect
): boolean {
  const context = getTableContext(state.doc, tablePos);
  if(!context || !isValidRect(rect, context.map)) return false;

  const selection = buildCellSelection(state.doc, context, rect);
  if(!selection) return false;

  dispatch?.(state.tr.setSelection(selection));
  return true;
}

export function progressiveSelectAllInChatInputTable(
  state: EditorState,
  dispatch?: Dispatch
): boolean {
  const {selection} = state;

  if(selection instanceof CellSelection) {
    const tablePos = selection.$headCell.start(-1) - 1;
    const descriptor = getChatInputTableSelection(state, tablePos);
    if(!descriptor) return false;

    if(descriptor.kind === 'table') {
      dispatch?.(state.tr.setSelection(new AllSelection(state.doc)));
      return true;
    }

    return selectChatInputTableRect(state, dispatch, tablePos, {
      bottom: descriptor.map.height,
      left: 0,
      right: descriptor.map.width,
      top: 0
    });
  }

  if(!(selection instanceof TextSelection)) return false;

  const $cell = cellAround(selection.$from);
  if(!$cell) return false;

  const tableStart = $cell.start(-1);
  const tablePos = tableStart - 1;
  const context = getTableContext(state.doc, tablePos);
  const cell = $cell.nodeAfter;
  if(!context || !cell || cell.type.spec.tableRole === undefined) return false;

  const $headCell = cellAround(selection.$to);
  if(!$headCell || $headCell.start(-1) !== tableStart) return false;

  if($headCell.pos !== $cell.pos) {
    return selectChatInputTableRect(state, dispatch, tablePos, {
      bottom: context.map.height,
      left: 0,
      right: context.map.width,
      top: 0
    });
  }

  const from = $cell.pos + 2;
  const to = $cell.pos + cell.nodeSize - 2;
  if(from === to || selection.from === from && selection.to === to) {
    return selectChatInputTableRect(state, dispatch, tablePos, {
      bottom: context.map.height,
      left: 0,
      right: context.map.width,
      top: 0
    });
  }

  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  return true;
}

export function normalizeExternalChatInputTableSelectAll(
  oldState: EditorState,
  newState: EditorState
): Transaction | undefined {
  if(!oldState.doc.eq(newState.doc) || !selectionCoversDocument(newState)) return;

  let selection: Selection | undefined;
  if(!progressiveSelectAllInChatInputTable(oldState, (transaction) => {
    selection = transaction.selection;
  })) return;
  if(!selection || selection.eq(newState.selection)) return;

  return newState.tr
  .setSelection(selection)
  .setMeta('addToHistory', false);
}

function selectionCoversDocument(state: EditorState) {
  const {doc, selection} = state;
  if(selection instanceof AllSelection) return true;

  const start = Selection.atStart(doc);
  const end = Selection.atEnd(doc);
  return selection.from <= start.from && selection.to >= end.to;
}

export function selectChatInputTableAxis(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  axis: ChatInputTableMoveAxis,
  from: number,
  to: number
): boolean {
  const context = getTableContext(state.doc, tablePos);
  if(!context) return false;

  const limit = axis === 'row' ? context.map.height : context.map.width;
  if(!isValidIndexRange(from, to, limit)) return false;

  const selection = buildAxisSelection(state.doc, context, axis, from, to);
  dispatch?.(state.tr.setSelection(selection));
  return true;
}

export function getChatInputTableCellAttr(
  state: EditorState,
  tablePos: number,
  name: ChatInputTableCellAttrName
): ChatInputTableCellAttr | undefined {
  const descriptor = getChatInputTableSelection(state, tablePos);
  if(!descriptor) return;

  const cells = getSelectedCells(descriptor);
  if(!cells.length) return;

  const value = cells[0].attrs[name] ?? undefined;
  return {
    isUniform: cells.every((cell) => (cell.attrs[name] ?? undefined) === value),
    value
  };
}

export function setChatInputTableCellAttr(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  name: ChatInputTableCellAttrName,
  value: unknown
): boolean {
  const descriptor = getChatInputTableSelection(state, tablePos);
  if(!descriptor) return false;

  const cells = getSelectedCells(descriptor);
  if(
    !cells.length ||
    cells.every((cell) => (cell.attrs[name] ?? undefined) === value)
  ) {
    return false;
  }

  if(dispatch) {
    const transaction = state.tr;
    descriptor.cellPositions.forEach((position, index) => {
      const cell = cells[index];
      if((cell.attrs[name] ?? undefined) === value) return;
      transaction.setNodeMarkup(position, undefined, {
        ...cell.attrs,
        [name]: value
      });
    });
    dispatch(transaction);
  }

  return true;
}

export function toggleChatInputTableBooleanAttr(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  name: ChatInputTableBooleanAttrName
): boolean {
  const descriptor = getChatInputTableSelection(state, tablePos);
  if(!descriptor) return false;

  dispatch?.(state.tr.setNodeMarkup(tablePos, undefined, {
    ...descriptor.table.attrs,
    [name]: !descriptor.table.attrs[name]
  }));
  return true;
}

export function canToggleChatInputTableHeaderCell(
  state: EditorState,
  tablePos: number
): boolean {
  return toggleChatInputTableHeaderCell(state, undefined, tablePos);
}

export function toggleChatInputTableHeaderCell(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number
): boolean {
  const descriptor = getChatInputTableSelection(state, tablePos);
  const tableCell = state.schema.nodes.tableCell;
  const tableHeader = state.schema.nodes.tableHeader;
  if(!descriptor || !tableCell || !tableHeader) return false;

  const cells = getSelectedCells(descriptor);
  if(!cells.length) return false;

  const removeHeader = cells.every((cell) => cell.type === tableHeader);
  const type = removeHeader ? tableCell : tableHeader;

  if(dispatch) {
    const transaction = state.tr;
    descriptor.cellPositions.forEach((position, index) => {
      const cell = cells[index];
      if(cell.type === type) return;
      transaction.setNodeMarkup(position, type, cell.attrs);
    });
    dispatch(transaction);
  }

  return true;
}

export function getChatInputTableMoveTargets(
  state: EditorState,
  tablePos: number,
  axis: ChatInputTableMoveAxis
): number[] {
  const descriptor = getChatInputTableSelection(state, tablePos);
  const context = descriptor && getMoveContext(descriptor, axis);
  if(!context) return [];

  const targets: number[] = [];
  const maxTarget = context.dimension - context.count;
  for(let target = 0; target <= maxTarget; ++target) {
    if(isLegalMoveTarget(context, axis, target)) targets.push(target);
  }
  return targets;
}

export function moveChatInputTableSelection(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  axis: ChatInputTableMoveAxis,
  toIndex: number
): boolean {
  const result = buildMovedTable(state, tablePos, axis, toIndex);
  return applyMovedTable(state, dispatch, tablePos, axis, toIndex, result);
}

export function moveChatInputTableAxisRange(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  axis: ChatInputTableMoveAxis,
  fromIndex: number,
  count: number,
  toIndex: number
): boolean {
  const context = getTableContext(state.doc, tablePos);
  const to = fromIndex + count;
  if(
    !context ||
    !Number.isInteger(count) ||
    count <= 0 ||
    !isValidIndexRange(
      fromIndex,
      to,
      axis === 'row' ? context.map.height : context.map.width
    )
  ) {
    return false;
  }

  const selection = buildAxisSelection(
    state.doc,
    context,
    axis,
    fromIndex,
    to
  );
  const selectionState = state.apply(state.tr.setSelection(selection));
  const result = buildMovedTable(selectionState, tablePos, axis, toIndex);
  return applyMovedTable(state, dispatch, tablePos, axis, toIndex, result);
}

function applyMovedTable(
  state: EditorState,
  dispatch: Dispatch | undefined,
  tablePos: number,
  axis: ChatInputTableMoveAxis,
  toIndex: number,
  result: {count: number, table: ProseMirrorNode} | undefined
): boolean {
  if(!result) return false;

  if(dispatch) {
    const oldTable = state.doc.nodeAt(tablePos);
    if(!oldTable) return false;

    const transaction = state.tr.replaceWith(
      tablePos,
      tablePos + oldTable.nodeSize,
      result.table
    );
    const context = getTableContext(transaction.doc, tablePos);
    if(!context) return false;

    const selection = buildAxisSelection(
      transaction.doc,
      context,
      axis,
      toIndex,
      toIndex + result.count
    );
    dispatch(transaction.setSelection(selection).scrollIntoView());
  }

  return true;
}

function getTableContext(
  doc: ProseMirrorNode,
  tablePos: number
): TableContext | undefined {
  if(!Number.isInteger(tablePos) || tablePos < 0) return;

  const table = doc.nodeAt(tablePos);
  if(!table || table.type.spec.tableRole !== 'table') return;

  return {
    map: TableMap.get(table),
    table,
    tablePos,
    tableStart: tablePos + 1
  };
}

function getSelectedCellRange(
  state: EditorState,
  context: TableContext
): {anchorCellPos: number, headCellPos: number} | undefined {
  const {selection} = state;
  if(selection instanceof CellSelection) {
    if(
      selection.$anchorCell.start(-1) !== context.tableStart ||
      selection.$headCell.start(-1) !== context.tableStart
    ) {
      return;
    }

    return {
      anchorCellPos: selection.$anchorCell.pos,
      headCellPos: selection.$headCell.pos
    };
  }

  if(!(selection instanceof TextSelection) || !selection.empty) return;

  const $cell = cellAround(selection.$from);
  if(!$cell || $cell.start(-1) !== context.tableStart) return;

  return {
    anchorCellPos: $cell.pos,
    headCellPos: $cell.pos
  };
}

function getSelectionKind(
  rect: ChatInputTableRect,
  map: TableMap
): ChatInputTableSelectionKind {
  const wholeRow = rect.left === 0 && rect.right === map.width;
  const wholeColumn = rect.top === 0 && rect.bottom === map.height;
  if(wholeRow && wholeColumn) return 'table';
  if(wholeRow) return 'row';
  if(wholeColumn) return 'column';
  return 'cell';
}

function buildCellSelection(
  doc: ProseMirrorNode,
  context: TableContext,
  rect: ChatInputTableRect
): CellSelection | undefined {
  const closedRect = closeTableRect(context.map, rect);
  const anchorPosition = context.map.positionAt(
    closedRect.top,
    closedRect.left,
    context.table
  );
  const headPosition = context.map.positionAt(
    closedRect.bottom - 1,
    closedRect.right - 1,
    context.table
  );
  if(anchorPosition < 0 || headPosition < 0) return;

  return CellSelection.create(
    doc,
    context.tableStart + anchorPosition,
    context.tableStart + headPosition
  );
}

function buildAxisSelection(
  doc: ProseMirrorNode,
  context: TableContext,
  axis: ChatInputTableMoveAxis,
  from: number,
  to: number
): CellSelection {
  const row = axis === 'row';
  const rect = closeTableRect(context.map, {
    bottom: row ? to : context.map.height,
    left: row ? 0 : from,
    right: row ? context.map.width : to,
    top: row ? from : 0
  });
  const $anchor = doc.resolve(context.tableStart + context.map.positionAt(
    rect.top,
    rect.left,
    context.table
  ));
  const $head = doc.resolve(context.tableStart + context.map.positionAt(
    rect.bottom - 1,
    rect.right - 1,
    context.table
  ));
  return row ?
    CellSelection.rowSelection($anchor, $head) :
    CellSelection.colSelection($anchor, $head);
}

export function closeTableRect(
  map: TableMap,
  rect: ChatInputTableRect
): ChatInputTableRect {
  const closedRect = {...rect};
  let changed = true;

  while(changed) {
    changed = false;
    for(let row = closedRect.top; row < closedRect.bottom; ++row) {
      for(let column = closedRect.left; column < closedRect.right; ++column) {
        const position = map.map[row * map.width + column];
        const cellRect = map.findCell(position);
        const next = {
          bottom: Math.max(closedRect.bottom, cellRect.bottom),
          left: Math.min(closedRect.left, cellRect.left),
          right: Math.max(closedRect.right, cellRect.right),
          top: Math.min(closedRect.top, cellRect.top)
        };
        if(
          next.bottom === closedRect.bottom &&
          next.left === closedRect.left &&
          next.right === closedRect.right &&
          next.top === closedRect.top
        ) {
          continue;
        }
        Object.assign(closedRect, next);
        changed = true;
      }
    }
  }

  return closedRect;
}

function isValidRect(rect: ChatInputTableRect, map: TableMap) {
  return isValidIndexRange(rect.left, rect.right, map.width) &&
    isValidIndexRange(rect.top, rect.bottom, map.height);
}

function isValidIndexRange(from: number, to: number, limit: number) {
  return Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    from < to &&
    to <= limit;
}

function getSelectedCells(descriptor: ChatInputTableSelection) {
  return descriptor.cellPositions.map(
    (position) => descriptor.table.nodeAt(position - descriptor.tableStart)!
  );
}

function getMoveContext(
  descriptor: ChatInputTableSelection,
  axis: ChatInputTableMoveAxis
): MoveContext | undefined {
  const wholeAxis = axis === 'row' ?
    descriptor.rect.left === 0 && descriptor.rect.right === descriptor.map.width :
    descriptor.rect.top === 0 && descriptor.rect.bottom === descriptor.map.height;
  if(!wholeAxis) return;

  const fromIndex = axis === 'row' ? descriptor.rect.top : descriptor.rect.left;
  const endIndex = axis === 'row' ? descriptor.rect.bottom : descriptor.rect.right;
  return {
    count: endIndex - fromIndex,
    descriptor,
    dimension: axis === 'row' ? descriptor.map.height : descriptor.map.width,
    fromIndex
  };
}

function isLegalMoveTarget(
  context: MoveContext,
  axis: ChatInputTableMoveAxis,
  toIndex: number
) {
  const {count, descriptor, dimension, fromIndex} = context;
  if(
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex > dimension - count ||
    toIndex === fromIndex
  ) {
    return false;
  }

  const sourceEnd = fromIndex + count;
  if(
    !isOpenBoundary(descriptor.map, axis, fromIndex) ||
    !isOpenBoundary(descriptor.map, axis, sourceEnd)
  ) {
    return false;
  }

  const targetBoundary = toIndex < fromIndex ? toIndex : toIndex + count;
  return isOpenBoundary(descriptor.map, axis, targetBoundary);
}

function isOpenBoundary(
  map: TableMap,
  axis: ChatInputTableMoveAxis,
  boundary: number
) {
  const dimension = axis === 'row' ? map.height : map.width;
  if(boundary <= 0 || boundary >= dimension) return true;

  if(axis === 'row') {
    for(let column = 0; column < map.width; ++column) {
      if(
        map.map[(boundary - 1) * map.width + column] ===
        map.map[boundary * map.width + column]
      ) {
        return false;
      }
    }
    return true;
  }

  for(let row = 0; row < map.height; ++row) {
    if(
      map.map[row * map.width + boundary - 1] ===
      map.map[row * map.width + boundary]
    ) {
      return false;
    }
  }
  return true;
}

function buildMovedTable(
  state: EditorState,
  tablePos: number,
  axis: ChatInputTableMoveAxis,
  toIndex: number
): {count: number, table: ProseMirrorNode} | undefined {
  const descriptor = getChatInputTableSelection(state, tablePos);
  if(!descriptor) return;

  const context = getMoveContext(descriptor, axis);
  if(!context || !isLegalMoveTarget(context, axis, toIndex)) return;

  const {count, fromIndex} = context;
  if(axis === 'row') {
    const rows = Array.from(
      {length: descriptor.table.childCount},
      (_, index) => descriptor.table.child(index)
    );
    const selectedRows = rows.splice(fromIndex, count);
    rows.splice(toIndex, 0, ...selectedRows);
    return {
      count,
      table: descriptor.table.type.createChecked(
        descriptor.table.attrs,
        rows,
        descriptor.table.marks
      )
    };
  }

  const backward = toIndex < fromIndex;
  let movedCount = 0;
  let temporaryState = state;

  while(movedCount < count) {
    const originIndex = backward ?
      fromIndex + movedCount :
      fromIndex + count - movedCount - 1;
    const targetIndex = backward ?
      toIndex + movedCount :
      toIndex + count - movedCount - 1;
    const transaction = runCommand(
      temporaryState,
      getMoveCommand(axis, originIndex, targetIndex, tablePos)
    );
    if(!transaction) return;

    temporaryState = temporaryState.apply(transaction);
    const movedSelection = getChatInputTableSelection(temporaryState, tablePos);
    if(!movedSelection) return;

    const currentCount = movedSelection.rect.right - movedSelection.rect.left;
    if(currentCount <= 0 || movedCount + currentCount > count) return;
    movedCount += currentCount;
  }

  const table = temporaryState.doc.nodeAt(tablePos);
  if(!table || table.type.spec.tableRole !== 'table') return;
  return {count, table};
}

function getMoveCommand(
  axis: ChatInputTableMoveAxis,
  from: number,
  to: number,
  tablePos: number
): Command {
  const options = {
    from,
    pos: tablePos + 1,
    select: true,
    to
  };
  return axis === 'row' ? moveTableRow(options) : moveTableColumn(options);
}

function runCommand(
  state: EditorState,
  command: Command
): Transaction | undefined {
  let transaction: Transaction | undefined;
  const handled = command(state, (nextTransaction) => {
    transaction = nextTransaction;
  });
  return handled ? transaction : undefined;
}

function getAncestorTable(state: EditorState) {
  const {$anchor} = state.selection;
  for(let depth = $anchor.depth; depth > 0; --depth) {
    const node = $anchor.node(depth);
    if(node.type.name !== CHAT_TABLE_WRAPPER_NODE_NAME) continue;
    return {
      depth,
      from: $anchor.before(depth),
      index: $anchor.index(depth - 1),
      node,
      parent: $anchor.node(depth - 1),
      to: $anchor.after(depth)
    };
  }
  for(let depth = $anchor.depth; depth > 0; --depth) {
    const node = $anchor.node(depth);
    if(node.type.spec.tableRole !== 'table') continue;
    return {
      depth,
      from: $anchor.before(depth),
      index: $anchor.index(depth - 1),
      node,
      parent: $anchor.node(depth - 1),
      to: $anchor.after(depth)
    };
  }
}
