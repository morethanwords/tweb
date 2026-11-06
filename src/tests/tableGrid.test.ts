import measureTableGrid, {tableSpan} from '@lib/richTextProcessor/tableGrid';
import createSeededRandom from '@/tests/helpers/seededRandom';

type Cell = {colspan?: number, rowspan?: number};
const row = (...cells: Cell[]) => ({cells});
const one = {};

// Row i holds a cell reaching down to the last row and one filling the rest of the width: every row
// starts after the cells of all the rows above.
const stairs = (rows: number) => Array.from({length: rows}, (_, i) => rows - i > 1 ?
  row({rowspan: rows - i}, {colspan: rows - i - 1}) :
  row({rowspan: 1}));

/**
 * The table model of HTML, slot by slot: a cell takes the first slot of its row no earlier cell
 * covers, then covers its colspan × rowspan slots (rows past the last one dropped).
 */
function slotGrid(rows: {cells: Cell[]}[], maxColumns = Number.MAX_SAFE_INTEGER) {
  const covered = new Set<string>();
  let width = 0;
  let conflict = false;
  const span = (value: number) => {
    if(value === undefined) return 1;
    if(Number.isInteger(value) && value > 0) return value;
    conflict = true;
    return 1;
  };
  rows.forEach(({cells}, y) => {
    let x = 0;
    for(const cell of cells) {
      while(covered.has(`${x},${y}`)) ++x;
      const colspan = span(cell.colspan);
      const rowspan = span(cell.rowspan);
      for(let dy = 0; dy < rowspan && y + dy < rows.length; ++dy) {
        for(let dx = 0; dx < colspan; ++dx) {
          const slot = `${x + dx},${y + dy}`;
          if(covered.has(slot)) conflict = true;
          covered.add(slot);
        }
      }
      x += colspan;
      width = Math.max(width, x);
    }
  });
  return {columns: Math.min(width, maxColumns), conflict};
}

describe('table grid', () => {
  test('counts the columns of plain rows, a ragged row included', () => {
    expect(measureTableGrid([row(one, one, one), row(one, one)])).toEqual({columns: 3, conflict: false});
    expect(measureTableGrid([row(one), row(one, one, one, one)])).toEqual({columns: 4, conflict: false});
    expect(measureTableGrid([])).toEqual({columns: 0, conflict: false});
  });

  test('counts a column spanned by a cell, and a row that a cell from above reaches into', () => {
    expect(measureTableGrid([row({colspan: 3}), row(one, one)]).columns).toBe(3);
    // A takes the first column of both rows, so the second row's cells start at the second
    expect(measureTableGrid([row({rowspan: 2}, one), row(one, one)]).columns).toBe(3);
    expect(measureTableGrid([row({rowspan: 3}, {colspan: 2}), row(one, one), row(one, one, one)]).columns).toBe(4);
  });

  test('tells of cells on one slot and of invalid spans', () => {
    // the second row's first cell goes after A's column, its colspan then runs into B
    expect(measureTableGrid([row(one, {rowspan: 2}), row({colspan: 2})]).conflict).toBe(true);
    expect(measureTableGrid([row({colspan: 0})]).conflict).toBe(true);
    expect(measureTableGrid([row({rowspan: 1.5})]).conflict).toBe(true);
  });

  test('caps the width it reports', () => {
    expect(measureTableGrid([row({colspan: 50})], 20).columns).toBe(20);
  });

  test('lays out a staircase of rows reaching down to the end', () => {
    expect(measureTableGrid(stairs(4))).toEqual({columns: 4, conflict: false});
    expect(measureTableGrid(stairs(4))).toEqual(slotGrid(stairs(4)));
  });

  test('measures a large staircase at once', () => {
    // A message can carry a table like this one: it took the tab ~50 s when every row looked through
    // all the cells above it on every row they reach.
    const rows = stairs(2200);
    const startedAt = performance.now();
    expect(measureTableGrid(rows)).toEqual({columns: 2200, conflict: false});
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  test('agrees with the table model slot by slot', () => {
    const random = createSeededRandom(0x2F6B3A91);
    const span = () => [undefined, 1, 2, 3, 4, 0, 1.5][random(10) < 8 ? random(5) : 5 + random(2)];

    for(let i = 0; i < 3000; ++i) {
      const rows = Array.from({length: 1 + random(7)}, () => ({
        cells: Array.from({length: random(5)}, (): Cell => ({colspan: span(), rowspan: span()}))
      }));
      const maxColumns = random(2) ? undefined : 1 + random(8);
      expect(measureTableGrid(rows, maxColumns), JSON.stringify(rows)).toEqual(slotGrid(rows, maxColumns));
    }
  });

  test('reads a missing span as one and an invalid one as invalid', () => {
    expect(tableSpan()).toEqual({valid: true, value: 1});
    expect(tableSpan(3)).toEqual({valid: true, value: 3});
    expect(tableSpan(-1)).toEqual({valid: false, value: 1});
  });
});
