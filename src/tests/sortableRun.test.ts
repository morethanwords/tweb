import {beforeEach, describe, expect, it} from 'vitest';
import getSortableRun, {isSortableElement} from '@helpers/dom/sortableRun';

let list: HTMLElement;

/** Builds a list out of the classes each of its rows carries */
const makeList = (rows: string[]) => {
  list = document.createElement('ul');
  rows.forEach((className) => {
    const row = document.createElement('li');
    if(className) row.className = className;
    list.append(row);
  });

  return Array.from(list.children) as HTMLElement[];
};

const titles = (items: HTMLElement[]) => items.map((item) => Array.from(list.children).indexOf(item));

beforeEach(() => {
  list = undefined;
});

describe('getSortableRun', () => {
  it('takes every sibling of a list that is sortable throughout', () => {
    const rows = makeList(['', '', '']);
    expect(titles(getSortableRun(rows[1]))).toEqual([0, 1, 2]);
  });

  it('stops at a sibling that cannot be sorted', () => {
    const rows = makeList(['', 'cant-sort', '', '', 'cant-sort', '']);
    expect(titles(getSortableRun(rows[2]))).toEqual([2, 3]);
    expect(titles(getSortableRun(rows[0]))).toEqual([0]);
  });

  it('takes only the rows of the block when one is asked for', () => {
    // a chat list: the pinned block is what can be reordered, the chats below it are not
    const rows = makeList(['is-pinned', 'is-pinned', '', '']);
    expect(titles(getSortableRun(rows[0], 'is-pinned'))).toEqual([0, 1]);
    // a row outside the block is a run of its own, which is what keeps it from being dragged
    expect(titles(getSortableRun(rows[3], 'is-pinned'))).toEqual([3]);
  });

  it('answers with the element itself when it stands alone', () => {
    const rows = makeList(['is-pinned', '', '']);
    expect(titles(getSortableRun(rows[0], 'is-pinned'))).toEqual([0]);
  });
});

describe('isSortableElement', () => {
  it('reads both ways of saying what takes part', () => {
    const rows = makeList(['', 'cant-sort', 'is-pinned']);
    expect(isSortableElement(rows[0])).toBe(true);
    expect(isSortableElement(rows[1])).toBe(false);
    expect(isSortableElement(rows[0], 'is-pinned')).toBe(false);
    expect(isSortableElement(rows[2], 'is-pinned')).toBe(true);
    expect(isSortableElement(undefined)).toBe(false);
  });
});
