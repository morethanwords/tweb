import measureTableGrid, {tableSpan} from '@lib/richTextProcessor/tableGrid';

const row = (...cells: {colspan?: number, rowspan?: number}[]) => ({cells});
const one = {};

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

  test('reads a missing span as one and an invalid one as invalid', () => {
    expect(tableSpan()).toEqual({valid: true, value: 1});
    expect(tableSpan(3)).toEqual({valid: true, value: 3});
    expect(tableSpan(-1)).toEqual({valid: false, value: 1});
  });
});
