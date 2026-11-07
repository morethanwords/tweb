/**
 * Where things go on the field: staggered lattices of Android's `QrShareView`, each node moved off by a stable amount.
 * The gift's field drifts under the screen as one painted tile that repeats (`FieldPeriod`): a node's look
 * comes from its place in the tile, and a shift by the period gives the same picture. The emoji are placed anew every
 * frame on a lattice that does not repeat (`placeEmojiField`). Pure, so a test needs no DOM.
 */

export type Rect = {left: number, top: number, width: number, height: number};

/** The picture repeats every `width` across and `height` down; `cols` and `rows` (even) count the cells of the tile */
export type FieldPeriod = {width: number, height: number, cols: number, rows: number};

// Android's lattices (dp, here px), bent a little to fit a whole number of cells in the tile: the gift's models are
// 170 x 150 and its symbols 44 x 38
export const GIFT_PERIOD: FieldPeriod = {width: 510, height: 600, cols: 3, rows: 4};
const SYMBOL_CELLS = {cols: 12, rows: 16};
/** The band along the edges where the field fades out */
export const EDGE_BAND = 48;
/** The gap kept between a model and a symbol */
const CLEARANCE = 6;
const SYMBOL_ALPHA = 0.37;

export type Node = {x: number, y: number, size: number, angle: number, alpha: number, index: number};

/** A stable number in [0, 1) for a lattice node and a lane: the same field every time the screen opens */
export function hash(row: number, col: number, lane: number) {
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

/** 0 to 1 as `value` goes from `from` to `to`, easing at both ends */
export function smoothStep(from: number, to: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

// Android's emoji lattice (`drawEmojiFieldInner`): 86 x 70, odd rows a half cell along
const EMOJI_DX = 86, EMOJI_DY = 70;
// `EdgeSqueeze`: near an edge the distance to it is pressed, d' = band * e^(d / band - 1), the size by the same factor;
// what lies this far past the edges is walked too, as it is pressed into the band
const SQUEEZE_BAND = 90, SQUEEZE_MARGIN = SQUEEZE_BAND * 1.3;
const SQUEEZE_MIN_SIZE = 9, SQUEEZE_EDGE_FADE = 12;

/** One frame of the emoji field: how it stands on a surface of this size */
export type EmojiFieldFrame = {
  width: number,
  height: number,
  /** How far the field has moved (the drift and the finger) */
  x: number,
  y: number,
  /** The field's idle clock, seconds: each copy's own orbit, bob, sway and breath */
  time: number,
  /** The card's middle: the copies shrink and pale from it towards the edges */
  focusX: number,
  focusY: number,
  /** How many emoji take turns on the lattice */
  count: number
};

/** A copy as it is drawn: its middle, side and tilt on the surface, its opacity, which emoji and its own random */
export type PlacedEmoji = Node & {seed: number};

/**
 * The copies of the emoji on screen in this frame, as Android places them (`drawEmojiFieldInner`, `placeInner`,
 * `drawEmoji`): each copy on a slow orbit of its own, bobbing, swaying and breathing, smaller and paler towards the
 * edges from the card, and pressed into the edges, where it fades. Every node holds a copy, as on iOS
 * (`QrStudioEmojiPatternView`): Android leaves a fifth of them empty, and those read as holes. The lattice has no
 * period: a node's look is its own. `visit` is handed one object, reused.
 */
export function placeEmojiField(frame: EmojiFieldFrame, visit: (emoji: PlacedEmoji) => void) {
  const {width: w, height: h, time, count} = frame;
  if(!count || !w || !h) return;
  // the screen and its margin about the surface's middle, where the lattice's first node stands
  const extentX = w / 2 + SQUEEZE_MARGIN, extentY = h / 2 + SQUEEZE_MARGIN;
  const placed: PlacedEmoji = {x: 0, y: 0, size: 0, angle: 0, alpha: 0, index: 0, seed: 0};
  // pressed into the band along one axis: the place, and the smallest factor of the copy's axes so far
  let factor: number;
  const squeeze = (value: number, end: number) => {
    const near = Math.min(value, end - value);
    if(near >= SQUEEZE_BAND) return value;
    const g = Math.exp(near / SQUEEZE_BAND - 1);
    factor = Math.min(factor, g);
    return value <= end - value ? SQUEEZE_BAND * g : end - SQUEEZE_BAND * g;
  };
  const r0 = Math.floor((-extentY - frame.y) / EMOJI_DY) - 1, r1 = Math.ceil((extentY - frame.y) / EMOJI_DY) + 1;
  for(let row = r0; row <= r1; ++row) {
    const shift = (row & 1) === 0 ? 0 : EMOJI_DX / 2;
    const c0 = Math.floor((-extentX - frame.x - shift) / EMOJI_DX) - 1, c1 = Math.ceil((extentX - frame.x - shift) / EMOJI_DX) + 1;
    for(let col = c0; col <= c1; ++col) {
      const h0 = hash(row, col, 0), phase = h0 * 2 * Math.PI;
      // its own orbit (`Lattice.own`): 3 to 10 px round, once in 9 to 20 s, either way
      const radius = 3 + 7 * hash(row, col, 2), period = 9 + 11 * hash(row, col, 3);
      const turn = (hash(row, col, 12) < 0.5 ? -1 : 1) * 2 * Math.PI * time / period + phase;
      let x = w / 2 + col * EMOJI_DX + shift + frame.x + radius * Math.cos(turn);
      let y = h / 2 + row * EMOJI_DY + frame.y + radius * Math.sin(turn) + Math.sin(time * 0.45 + phase) * 3;
      if(x < -SQUEEZE_MARGIN || x > w + SQUEEZE_MARGIN || y < -SQUEEZE_MARGIN || y > h + SQUEEZE_MARGIN) continue;

      const big = (row & 1) === 0;
      const size = 38 * (big ? 1.3 : 0.9) * (0.92 + 0.16 * h0);
      // from the card's middle: 1 where the ray from it meets the edge
      const dx = x - frame.focusX, dy = y - frame.focusY;
      let reach = 0;
      if(dx > 0.5) reach = Math.max(reach, dx / Math.max(1, w - frame.focusX));
      else if(dx < -0.5) reach = Math.max(reach, -dx / Math.max(1, frame.focusX));
      if(dy > 0.5) reach = Math.max(reach, dy / Math.max(1, h - frame.focusY));
      else if(dy < -0.5) reach = Math.max(reach, -dy / Math.max(1, frame.focusY));
      reach = Math.min(1, reach);
      const radialScale = 1 - 0.22 * smoothStep(0.55, 1, reach);
      const radialAlpha = 1 - 0.2 * smoothStep(0.8, 1, reach);

      factor = 1;
      x = squeeze(x, w);
      y = squeeze(y, h);

      let alpha = radialAlpha * smoothStep(0.08, 0.25, factor);
      if(alpha <= 0.004) continue;
      // never a speck: no smaller than 9 px, nor than 10 px for the shrink from the card
      const base = size * radialScale < 10 ? 10 / size : radialScale;
      const scale = Math.max(factor * base, Math.min(size, SQUEEZE_MIN_SIZE) / size);
      const half = size * scale / 2;
      alpha *= smoothStep(0, SQUEEZE_EDGE_FADE, Math.min(x - half, w - x - half, y - half, h - y - half));
      if(alpha <= 0.004) continue;

      const q = col - (row - (row & 1)) / 2;
      placed.x = x;
      placed.y = y;
      // the largest tier is drawn a tenth smaller about its middle, and every copy breathes by 3%
      placed.size = (big ? size * 0.9 : size) * scale * (1 + 0.03 * Math.sin(time * 1.3 + phase * 2));
      placed.angle = (h0 - 0.5) * 26 + 4 * Math.sin(time * 0.3 + phase);
      placed.alpha = alpha;
      placed.index = mod(q - row, count);
      placed.seed = hash(row, col, 13);
      visit(placed);
    }
  }
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
