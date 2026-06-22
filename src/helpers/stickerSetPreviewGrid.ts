/*
 * Computes the square grid geometry for a sticker-set / custom-emoji webpage preview.
 * Mirrors tdesktop history_view_web_page.cpp:1067-1068:
 *   side = ceil(sqrt(count)); single = box / side;
 * The grid is a square NxN (e.g. 4 stickers -> 2x2, 9 -> 3x3); each sticker is
 * centered in its cell. `count` is clamped to >= 1 to avoid NaN / divide-by-zero.
 */
export default function computeStickerSetPreviewGrid(count: number, boxSize = 56) {
  const n = Math.max(1, count);
  const side = Math.ceil(Math.sqrt(n));
  const cellSize = Math.floor(boxSize / side);
  return {side, cellSize, boxSize};
}
