type TableGridCell = {colspan?: number, rowspan?: number};
type TableInterval = {start: number, end: number};

export function tableSpan(value?: number) {
  if(value === undefined) return {valid: true, value: 1};
  const valid = Number.isInteger(value) && value > 0 && value <= 0x7FFFFFFF;
  return {
    valid,
    value: valid ? value : 1
  };
}

function intervalOverlaps(interval: TableInterval, start: number, end: number) {
  return interval.start < end && start < interval.end;
}

function firstFreeTableColumn(intervals: TableInterval[], start: number) {
  let column = start;
  for(const interval of intervals) {
    if(interval.start > column) break;
    if(interval.end > column) column = interval.end;
  }
  return column;
}

/**
 * Lays the rows out on their grid as a table does: a cell takes the first column its row has free,
 * after the cells reaching down from the rows above. `columns` is the grid's width (at most
 * `maxColumns`), `conflict` tells of an invalid span or two cells on one slot.
 */
export default function measureTableGrid(
  rows: readonly {cells: readonly TableGridCell[]}[],
  maxColumns = Number.MAX_SAFE_INTEGER
) {
  const occupancy = rows.map(() => [] as TableInterval[]);
  let columns = 0;
  let conflict = false;

  for(let rowIndex = 0; rowIndex < rows.length; ++rowIndex) {
    let column = 0;
    for(const cell of rows[rowIndex].cells) {
      column = firstFreeTableColumn(occupancy[rowIndex], column);
      const colspan = tableSpan(cell.colspan);
      const rowspan = tableSpan(cell.rowspan);
      if(!colspan.valid || !rowspan.valid) conflict = true;

      const end = Math.min(Number.MAX_SAFE_INTEGER, column + colspan.value);
      const rowLimit = Math.min(rows.length, rowIndex + rowspan.value);
      for(let occupiedRow = rowIndex; occupiedRow < rowLimit; ++occupiedRow) {
        const intervals = occupancy[occupiedRow];
        if(intervals.some((interval) => intervalOverlaps(interval, column, end))) {
          conflict = true;
        }
        intervals.push({start: column, end});
        intervals.sort((left, right) => left.start - right.start);
      }

      columns = Math.max(columns, Math.min(end, maxColumns));
      column = end;
    }
  }

  return {columns, conflict};
}
