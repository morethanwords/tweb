/**
 * Where things go on the field: staggered lattices of Android's `QrShareView`, each node moved off by a stable amount.
 * The field turns and drifts under the screen, so it is a tile that repeats (`FieldPeriod`): a node's look comes from
 * its place in the tile, and a shift by the period gives the same picture. Pure, so a test needs no DOM.
 */

export type Rect = {left: number, top: number, width: number, height: number};

/** The picture repeats every `width` across and `height` down; `cols` and `rows` (even) count the cells of the tile */
export type FieldPeriod = {width: number, height: number, cols: number, rows: number};

// Android's lattices (dp, here px), bent a little to fit a whole number of cells in the tile: the emoji pitch is 86 x 70
export const EMOJI_PERIOD: FieldPeriod = {width: 516, height: 420, cols: 6, rows: 6};
// the gift's models are 170 x 150 and its symbols 44 x 38
export const GIFT_PERIOD: FieldPeriod = {width: 510, height: 600, cols: 3, rows: 4};
const SYMBOL_CELLS = {cols: 12, rows: 16};
/** The band along the edges where the field fades out */
export const EDGE_BAND = 48;
/** The gap kept between a model and a symbol */
const CLEARANCE = 6;
const SYMBOL_ALPHA = 0.37;

export type Node = {x: number, y: number, size: number, angle: number, alpha: number, index: number};

/** A stable number in [0, 1) for a lattice node and a lane: the same field every time the screen opens */
function hash(row: number, col: number, lane: number) {
  let x = Math.imul(row * 73856093 ^ col * 19349663 ^ lane * 83492791, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** Walks a lattice of staggered rows over an area; the cell's hash is that of its place in the tile */
function walkLattice(width: number, height: number, tile: {width: number, height: number, cols: number, rows: number}, callback: (row: number, col: number, x: number, y: number) => void) {
  const dx = tile.width / tile.cols, dy = tile.height / tile.rows;
  for(let row = -1; row <= Math.ceil(height / dy) + 1; ++row) {
    const shift = (row & 1) === 0 ? 0 : dx / 2;
    for(let col = -1; col <= Math.ceil(width / dx) + 1; ++col) {
      callback(mod(row, tile.rows), mod(col, tile.cols), col * dx + shift, row * dy);
    }
  }
}

/** The emoji lattice: a fifth of the nodes empty, each off its node by a few pixels and tilted up to 13 degrees */
export function emojiNodes(width: number, height: number, count: number): Node[] {
  const nodes: Node[] = [];
  if(!count) return nodes;
  walkLattice(width, height, EMOJI_PERIOD, (row, col, x, y) => {
    const h = hash(row, col, 0);
    if(hash(row, col, 1) < 0.2) return;
    const orbit = 3 + 7 * hash(row, col, 2), turn = 2 * Math.PI * hash(row, col, 3);
    x += Math.cos(turn) * orbit;
    y += Math.sin(turn) * orbit;
    const size = 38 * ((row & 1) === 0 ? 1.3 * 0.9 : 0.9) * (0.92 + 0.16 * h);
    const q = col - (row - (row & 1)) / 2;
    nodes.push({x, y, size, angle: (h - 0.5) * 26, alpha: 1, index: mod(q - row, count)});
  });
  return nodes;
}

/** The gift's models: a sparse lattice, each jittered, tilted up to 11 degrees, 62 to 94 px */
export function modelNodes(width: number, height: number): Node[] {
  const nodes: Node[] = [];
  walkLattice(width, height, GIFT_PERIOD, (row, col, x, y) => {
    x += (hash(row, col, 4) - 0.5) * 76;
    y += (hash(row, col, 5) - 0.5) * 64;
    const size = 62 + 32 * hash(row, col, 6);
    nodes.push({x, y, size, angle: (hash(row, col, 7) - 0.5) * 22, alpha: 1, index: 0});
  });
  return nodes;
}

/** The gift's pattern symbols: a fine lattice, a quarter of it empty, kept clear of the models */
export function symbolNodes(width: number, height: number, models: Node[]): Node[] {
  const nodes: Node[] = [];
  walkLattice(width, height, {...GIFT_PERIOD, ...SYMBOL_CELLS}, (row, col, x, y) => {
    if(hash(row, col, 8) < 0.25) return;
    x += (hash(row, col, 9) - 0.5) * 38;
    y += (hash(row, col, 10) - 0.5) * 32;
    const h = hash(row, col, 11);
    const size = 23.1 * (0.55 + 0.75 * h * h);
    if(models.some((model) => (model.x - x) ** 2 + (model.y - y) ** 2 < (model.size * 0.66 / 2 + size / 2 + CLEARANCE) ** 2)) return;
    nodes.push({x, y, size, angle: (h - 0.5) * 40, alpha: SYMBOL_ALPHA, index: 0});
  });
  return nodes;
}
