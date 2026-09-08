import {ShellLimits, type KeyboardRow} from './core/types';

/** Insertion coordinates refer to the layout before the source is removed. */
export type KeyboardDestination =
  | {kind: 'row'; rowId: string; column: number}
  | {kind: 'new-row'; index: number};

export function sameKeyboardLayout(left: readonly KeyboardRow[], right: readonly KeyboardRow[]): boolean {
  return left.length === right.length && left.every((row, index) =>
    row.id === right[index]?.id && row.buttonIds.length === right[index]?.buttonIds.length &&
    row.buttonIds.every((id, column) => id === right[index]?.buttonIds[column]));
}

/** Atomic layout-only move. Payload and labels stay in the document's ID maps. */
export function moveKeyboardButton(
  rows: KeyboardRow[], buttonId: string, destination: KeyboardDestination, newRowId: string
): KeyboardRow[] {
  const sourceIndex = rows.findIndex(row => row.buttonIds.includes(buttonId));
  const source = rows[sourceIndex];
  if(!source) return rows;
  const column = source.buttonIds.indexOf(buttonId);
  const targetIndex = destination.kind === 'row' ? rows.findIndex(row => row.id === destination.rowId) : -1;
  if(destination.kind === 'row') {
    const target = rows[targetIndex];
    if(!target || !Number.isInteger(destination.column) || destination.column < 0 || destination.column > target.buttonIds.length) return rows;
    if(target.buttonIds.length - (sourceIndex === targetIndex ? 1 : 0) >= ShellLimits.buttonsPerRow) return rows;
    if(sourceIndex === targetIndex && source.buttonIds.length === 1) return rows;
  } else {
    if(!Number.isInteger(destination.index) || destination.index < 0 || destination.index > rows.length) return rows;
    if(source.buttonIds.length > 1 && (rows.length >= ShellLimits.rows || !newRowId || rows.some(row => row.id === newRowId))) return rows;
  }

  const next = rows.map(row => ({id: row.id, buttonIds: [...row.buttonIds]}));
  next[sourceIndex].buttonIds.splice(column, 1);
  const emptied = next[sourceIndex].buttonIds.length === 0;
  if(emptied) next.splice(sourceIndex, 1);

  if(destination.kind === 'new-row') {
    const index = destination.index - (emptied && sourceIndex < destination.index ? 1 : 0);
    // Moving a one-button row preserves its identity; splitting creates a row.
    next.splice(index, 0, {id: emptied ? source.id : newRowId, buttonIds: [buttonId]});
  } else {
    const target = next.find(row => row.id === destination.rowId);
    if(!target) return rows;
    const index = destination.column - (sourceIndex === targetIndex && column < destination.column ? 1 : 0);
    target.buttonIds.splice(index, 0, buttonId);
  }
  return sameKeyboardLayout(rows, next) ? rows : next;
}
