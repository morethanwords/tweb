/**
 * How tall `count` items of `size` px stand in a grid of `width` that auto-fills its rows: as many a row as fit with a
 * gap of `gapX` between each two, the rows `gapY` apart
 */
export default function autoFillGridHeight(width: number, count: number, size: number, gapX: number, gapY: number) {
  const perRow = Math.floor((width + gapX) / (size + gapX));
  const rows = Math.ceil(count / perRow);
  return rows * size + Math.max(0, rows - 1) * gapY;
}
