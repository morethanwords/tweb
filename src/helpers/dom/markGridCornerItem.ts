export const GRID_CORNER_CLASSES = ['is-corner-tl', 'is-corner-tr', 'is-corner-bl', 'is-corner-br'];

/**
 * Tag which corner of a `columns`-wide grid the given item occupies (`is-corner-*`), so CSS can
 * round just that corner of an active selection to match a rounded grid container. Clears any
 * previous tag first; bottom corners account for a (possibly partial) last row. Pass the active item
 * (or null/undefined to no-op). Shared by the Chat Wallpaper and Set-a-color pickers.
 */
export default function markGridCornerItem(grid: Element, item: Element | null | undefined, columns = 3) {
  if(!item) return;
  item.classList.remove(...GRID_CORNER_CLASSES);
  const i = Array.prototype.indexOf.call(grid.children, item);
  if(i < 0) return;
  const lastRow = Math.floor((grid.children.length - 1) / columns);
  const row = Math.floor(i / columns);
  const col = i % columns;
  if(row === 0 && col === 0) item.classList.add('is-corner-tl');
  if(row === 0 && col === columns - 1) item.classList.add('is-corner-tr');
  if(row === lastRow && col === 0) item.classList.add('is-corner-bl');
  if(row === lastRow && col === columns - 1) item.classList.add('is-corner-br');
}
