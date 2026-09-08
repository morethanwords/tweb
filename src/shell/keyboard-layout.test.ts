import {describe, expect, it} from 'vitest';
import {moveKeyboardButton, sameKeyboardLayout} from './keyboard-layout';
import type {KeyboardRow} from './core/types';

const rows = (): KeyboardRow[] => [{id: 'one', buttonIds: ['a', 'b', 'c']}, {id: 'two', buttonIds: ['d']}];

describe('atomic keyboard drag layout', () => {
  it('reorders in either direction using pre-removal insertion coordinates', () => {
    expect(moveKeyboardButton(rows(), 'a', {kind: 'row', rowId: 'one', column: 3}, 'new')[0].buttonIds).toEqual(['b', 'c', 'a']);
    expect(moveKeyboardButton(rows(), 'c', {kind: 'row', rowId: 'one', column: 0}, 'new')[0].buttonIds).toEqual(['c', 'a', 'b']);
  });
  it('moves across rows without changing input or stable IDs', () => {
    const original = rows();
    const result = moveKeyboardButton(original, 'b', {kind: 'row', rowId: 'two', column: 0}, 'new');
    expect(result).toEqual([{id: 'one', buttonIds: ['a', 'c']}, {id: 'two', buttonIds: ['b', 'd']}]);
    expect(original).toEqual(rows());
    expect(result.flatMap(row => row.buttonIds).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('removes an emptied row atomically and resolves a target after that row', () => {
    const result = moveKeyboardButton([{id: 'one', buttonIds: ['a']}, {id: 'two', buttonIds: ['b', 'c']}], 'a', {kind: 'row', rowId: 'two', column: 1}, 'new');
    expect(result).toEqual([{id: 'two', buttonIds: ['b', 'a', 'c']}]);
  });
  it('splits a button into each original row gap with a fresh stable row ID', () => {
    for(const index of [0, 1, 2]) {
      const result = moveKeyboardButton(rows(), 'b', {kind: 'new-row', index}, 'new');
      expect(result[index]).toEqual({id: 'new', buttonIds: ['b']});
      expect(result.find(row => row.id === 'one')?.buttonIds).toEqual(['a', 'c']);
    }
  });
  it('preserves a one-button row ID when dragging it to a new gap', () => {
    expect(moveKeyboardButton(rows(), 'd', {kind: 'new-row', index: 0}, 'new')).toEqual([
      {id: 'two', buttonIds: ['d']}, {id: 'one', buttonIds: ['a', 'b', 'c']}
    ]);
  });
  it('does not create a mutation for either adjacent self gap or self insertion', () => {
    const original = rows();
    for(const index of [1, 2]) expect(moveKeyboardButton(original, 'd', {kind: 'new-row', index}, 'new')).toBe(original);
    for(const column of [1, 2]) expect(moveKeyboardButton(original, 'b', {kind: 'row', rowId: 'one', column}, 'new')).toBe(original);
    expect(moveKeyboardButton(original, 'd', {kind: 'row', rowId: 'two', column: 1}, 'new')).toBe(original);
  });
  it('rejects full rows but permits reordering within a full row', () => {
    const original = [{id: 'full', buttonIds: Array.from({length: 8}, (_, i) => `b${i}`)}, {id: 'other', buttonIds: ['x']}];
    expect(moveKeyboardButton(original, 'x', {kind: 'row', rowId: 'full', column: 8}, 'new')).toBe(original);
    expect(moveKeyboardButton(original, 'b0', {kind: 'row', rowId: 'full', column: 8}, 'new')[0].buttonIds.at(-1)).toBe('b0');
  });
  it('rejects a ninth row while allowing a singleton row to move at the limit', () => {
    const original = Array.from({length: 8}, (_, i) => ({id: `r${i}`, buttonIds: [`b${i}`]}));
    original[0].buttonIds.push('extra');
    expect(moveKeyboardButton(original, 'extra', {kind: 'new-row', index: 1}, 'new')).toBe(original);
    const moved = moveKeyboardButton(original, 'b7', {kind: 'new-row', index: 0}, 'new');
    expect(moved).toHaveLength(8);
    expect(moved[0]).toEqual({id: 'r7', buttonIds: ['b7']});
  });
  it('rejects missing IDs, invalid indexes, and duplicate new row IDs', () => {
    const original = rows();
    expect(moveKeyboardButton(original, 'missing', {kind: 'new-row', index: 0}, 'new')).toBe(original);
    expect(moveKeyboardButton(original, 'a', {kind: 'row', rowId: 'missing', column: 0}, 'new')).toBe(original);
    for(const index of [-1, 3, .5, NaN]) expect(moveKeyboardButton(original, 'a', {kind: 'new-row', index}, 'new')).toBe(original);
    for(const column of [-1, 4, .5, NaN]) expect(moveKeyboardButton(original, 'a', {kind: 'row', rowId: 'one', column}, 'new')).toBe(original);
    for(const id of ['', 'one', 'two']) expect(moveKeyboardButton(original, 'a', {kind: 'new-row', index: 0}, id)).toBe(original);
  });
  it('compares both row and button identities for exact no-op detection', () => {
    expect(sameKeyboardLayout(rows(), rows())).toBe(true);
    expect(sameKeyboardLayout(rows(), [{id: 'other', buttonIds: ['a', 'b', 'c']}, {id: 'two', buttonIds: ['d']}])).toBe(false);
  });
});
