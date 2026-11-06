type TableGridCell = {colspan?: number, rowspan?: number};
// A cell reaching down into the rows below its own: its columns, and the row it stops before.
type TableRowSpan = {start: number, end: number, endRow: number};

export function tableSpan(value?: number) {
  if(value === undefined) return {valid: true, value: 1};
  const valid = Number.isInteger(value) && value > 0 && value <= 0x7FFFFFFF;
  return {
    valid,
    value: valid ? value : 1
  };
}

/** Both lists in column order, merged into one in column order. */
function mergeRowSpans(spans: TableRowSpan[], started: TableRowSpan[]) {
  if(!spans.length || started[0].start >= spans[spans.length - 1].start) {
    for(const span of started) spans.push(span);
    return spans;
  }

  const merged: TableRowSpan[] = [];
  let index = 0;
  for(const span of spans) {
    while(index < started.length && started[index].start < span.start) {
      merged.push(started[index++]);
    }
    merged.push(span);
  }
  while(index < started.length) merged.push(started[index++]);
  return merged;
}

/**
 * Lays the rows out on their grid as a table does: a cell takes the first column its row has free,
 * after the cells reaching down from the rows above. `columns` is the grid's width (at most
 * `maxColumns`), `conflict` tells of an invalid span or two cells on one slot.
 *
 * The table is whatever its sender made it, so a row walks the cells reaching into it from above once,
 * left to right, whatever their spans: rows × such cells at most, less than the browser's own layout of
 * the table costs.
 */
export default function measureTableGrid(
  rows: readonly {cells: readonly TableGridCell[]}[],
  maxColumns = Number.MAX_SAFE_INTEGER
) {
  // the cells of the rows above that reach into this row, in column order
  let spans: TableRowSpan[] = [];
  // the first row one of them stops before
  let nextEndRow = Infinity;
  let columns = 0;
  let conflict = false;

  for(let rowIndex = 0; rowIndex < rows.length; ++rowIndex) {
    if(rowIndex >= nextEndRow) {
      spans = spans.filter((span) => span.endRow > rowIndex);
      nextEndRow = spans.reduce((min, span) => Math.min(min, span.endRow), Infinity);
    }

    const started: TableRowSpan[] = [];
    let spanIndex = 0;
    let column = 0;
    for(const cell of rows[rowIndex].cells) {
      // a cell starts neither where one from above stands nor before its end
      for(; spanIndex < spans.length && spans[spanIndex].start <= column; ++spanIndex) {
        column = Math.max(column, spans[spanIndex].end);
      }

      const colspan = tableSpan(cell.colspan);
      const rowspan = tableSpan(cell.rowspan);
      if(!colspan.valid || !rowspan.valid) conflict = true;

      const end = Math.min(Number.MAX_SAFE_INTEGER, column + colspan.value);
      // the spans left all start after `column`: the first of them inside this cell shares a slot with it
      if(spanIndex < spans.length && spans[spanIndex].start < end) conflict = true;

      const endRow = Math.min(rows.length, rowIndex + rowspan.value);
      if(endRow > rowIndex + 1) {
        started.push({start: column, end, endRow});
        nextEndRow = Math.min(nextEndRow, endRow);
      }

      columns = Math.max(columns, Math.min(end, maxColumns));
      column = end;
    }

    // a row's cells are in column order, and reach the rows below only from the next one on
    if(started.length) spans = mergeRowSpans(spans, started);
  }

  return {columns, conflict};
}
