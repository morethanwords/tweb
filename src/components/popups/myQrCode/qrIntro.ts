import {easeOutCubicApply} from '@helpers/easing/easeOutCubic';
import clamp from '@helpers/number/clamp';
import {nodeFrame} from '@helpers/schedulers';
import {hash} from '@components/popups/myQrCode/fieldNodes';
import {QrModules} from '@components/popups/myQrCode/qr';
import {revealSpring} from '@components/popups/myQrCode/reveal';

/**
 * The code building itself as the screen opens (`QrCodeLayer`'s first build): every module starts as a small dot of a
 * halftone; from the middle outwards the dots of the code grow into rounded squares and hand over to the code's own
 * cells, fading into them, and the others shrink away; the logo comes in with the middle of the wave. A finder, a little
 * ahead, grows in whole from its middle, as Android's `drawFinders` has it, over the dots of its modules shrinking away:
 * its ring is rounder than its cells (`extra-rounded`), and the dots of its corners would stand out of it. Once every
 * cell has handed over, the code itself replaces the build in one frame, the same picture.
 */

// the intro's clock (`introProgress`): Android's spring (damping 0.9, period 0.62 s, done at 0.467 s) stretched to
// 920 ms, the first half of the build in its first tenth, and from 80% a cubic ease into a stop
const INTRO_MS = 920, INTRO_HALF = 0.1, SPRING_DONE_S = 0.467;
// a dot grows over this much of the build, and the halftone comes up over its first tenth
const DOT_SPAN = 0.434, INTRO_FADE = 0.1;
// the dots' corners: a circle at first, a rounded square (30%) grown
const DOT_STEPS = 8;
// a finder grows in from this share of its size
const FINDER_FROM = 0.6;
// error correction L: the logo hides this share of the modules (`qr-code-styling`)
const LOGO_SHARE = 0.07;

const springProgress = (t: number) => Math.min(1, revealSpring(t) * 1.02);

/** The share of the spring's time when it passes `value` */
function springShare(value: number) {
  for(let i = 0; i <= 1000; ++i) {
    if(springProgress(i / 1000 * SPRING_DONE_S) >= value) return i / 1000;
  }

  return 1;
}

const NATURAL_HALF = springShare(0.5), SHARE_80 = springShare(0.8);

/** The build's progress `elapsed` ms after it started, 0 to 1 */
export function introProgress(elapsed: number) {
  let u = Math.min(1, elapsed / INTRO_MS);
  if(u >= 1) return 1;
  u = u < INTRO_HALF ? u * NATURAL_HALF / INTRO_HALF : NATURAL_HALF + (u - INTRO_HALF) * (1 - NATURAL_HALF) / (1 - INTRO_HALF);
  if(u <= SHARE_80) return springProgress(u * SPRING_DONE_S);
  // a Hermite from the spring's 80% to exactly 1 with no speed left: the same value and slope where it joins
  const p0 = springProgress(SHARE_80 * SPRING_DONE_S);
  const m0 = Math.min((springProgress((SHARE_80 + 0.002) * SPRING_DONE_S) - p0) / 0.002 * (1 - SHARE_80), 3 * (1 - p0));
  const t = (u - SHARE_80) / (1 - SHARE_80), t2 = t * t, t3 = t2 * t;
  return Math.min(1, (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2));
}

function easeInOut(u: number) {
  u = Math.min(1, Math.max(0, u));
  if(u < 0.5) return 4 * u * u * u;
  const v = -2 * u + 2;
  return 1 - v * v * v / 2;
}

/** How many modules across the logo hides: the library's sum for a square logo */
function logoModules(count: number) {
  let side = Math.max(1, Math.floor(Math.sqrt(Math.floor(LOGO_SHARE * count * count))));
  side = Math.min(side, count - 14);
  return side % 2 ? side : side - 1;
}

/**
 * The build of `code` (the finished drawing and its modules) on a canvas of `side` px, in the ink; `play` runs it from
 * its first frame and calls `onDone` once the code itself can take its place, and returns a stop. A code that comes
 * while it builds (another ink, another link) is what it goes on building (`replace`), as Android does.
 */
export default function createQrIntro(code: HTMLCanvasElement, modules: QrModules, side: number, ink: string) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(side * dpr);
  const ctx = canvas.getContext('2d');

  /** Whole pixels: the tiles of the modules, the logo and the finders cover the canvas edge to edge */
  type Tile = [x: number, y: number, width: number, height: number];
  /** A module: where it stands, its tile, when it grows; a finder's grows with its finder */
  type Module = {x: number, y: number, tile: Tile, delay: number, dark: boolean, finder: boolean};
  let list: Module[], finders: Tile[], finderDelay: number, size: number, half: number, logoTile: Tile;
  const prepare = () => {
    // where the modules stand in the drawing (`qr-code-styling`, no margin): whole pixels each, centred
    const {count, dark} = modules;
    const cell = Math.floor(code.width / count), begin = Math.floor((code.width - count * cell) / 2);
    const scale = canvas.width / code.width;
    size = cell * scale;
    half = size / 2;
    // the grid's lines on the canvas, rounded: what lies between two of them is one module's, its ink spilt past its
    // edge by the scaling down included, and the outer ones take the margin
    const line = (index: number) => index <= 0 ? 0 : index >= count ? canvas.width : Math.round((begin + index * cell) * scale);
    const tile = (row: number, col: number, rows = 1, cols = 1): Tile =>
      [line(col), line(row), line(col + cols) - line(col), line(row + rows) - line(row)];
    const logo = logoModules(count), logoFrom = (count - logo) / 2, logoTo = logoFrom + logo;
    logoTile = tile(logoFrom, logoFrom, logo, logo);
    const inLogo = (row: number, col: number) => row >= logoFrom && row < logoTo && col >= logoFrom && col < logoTo;
    // the three corners but the one at the bottom end, each a little ahead of the wave
    const inFinder = (row: number, col: number) => (row < 7 || row >= count - 7) && (col < 7 || col >= count - 7) && !(row >= count - 7 && col >= count - 7);
    const middle = (count - 1) / 2, farthest = middle * Math.SQRT2;
    const distance = (row: number, col: number) => Math.hypot(col - middle, row - middle) / farthest;
    finders = [tile(0, 0, 7, 7), tile(0, count - 7, 7, 7), tile(count - 7, 0, 7, 7)];
    finderDelay = distance(3, 3) * 0.5 * 0.85;
    list = [];
    for(let row = 0; row < count; ++row) {
      for(let col = 0; col < count; ++col) {
        if(inLogo(row, col)) continue;
        const finder = inFinder(row, col);
        list.push({
          x: (begin + col * cell) * scale,
          y: (begin + row * cell) * scale,
          tile: tile(row, col),
          delay: finder ? finderDelay : distance(row, col) * 0.5 + hash(row, col, 20) * 0.06,
          dark: dark[row * count + col],
          finder
        });
      }
    }
  };
  prepare();

  /** Draws the build at `progress`; true once every cell has handed over */
  const draw = (progress: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.min(1, Math.max(0, progress) / INTRO_FADE);
    // the dots by their opacity, a sixteenth apart: one fill each
    const dots = new Map<number, Path2D>();
    const addDot = (alpha: number, x: number, y: number, side: number, round: number) => {
      const key = Math.round(alpha * 16);
      if(!key) return;
      let path = dots.get(key);
      if(!path) dots.set(key, path = new Path2D());
      // a square where a path has no rounded rectangles
      if(path.roundRect) path.roundRect(x - side / 2, y - side / 2, side, side, side / 2 * round);
      else path.rect(x - side / 2, y - side / 2, side, side);
    };
    // how much of the code each tile shows: a mask the code is drawn into
    const reveal = (tile: Tile, alpha: number) => {
      if(alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillRect(tile[0], tile[1], tile[2], tile[3]);
    };

    let done = true;
    for(const module of list) {
      const grown = easeInOut((progress - module.delay) / DOT_SPAN);
      if(grown < 1) done = false;
      const handover = grown > 0.75 ? (grown - 0.75) * 4 : 0;
      // the code's own cell comes in over the first half of the handover, under its dot going over the whole of it
      if(!module.finder) reveal(module.tile, fade * Math.min(1, handover * 2));
      const x = module.x + half, y = module.y + half;
      if(module.dark && !module.finder) {
        if(handover >= 1) continue;
        const step = Math.round(grown * (DOT_STEPS - 1));
        addDot(fade * (1 - handover), x, y, size * (0.2 + 0.8 * grown) * 45 / 48, 1 - 0.7 * step / (DOT_STEPS - 1));
      } else {
        const alpha = fade * 0.9 * (grown < 0.7 ? 1 : 1 - (grown - 0.7) / 0.3);
        const shrink = 0.2 * (1 - grown);
        if(shrink > 0.01) addDot(alpha, x, y, size * shrink * 45 / 48, 1);
      }
    }

    if(done && fade >= 1) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return true;
    }

    // the logo's square, with the middle of the wave
    reveal(logoTile, fade * easeOutCubicApply(clamp((progress - 0.05) / 0.45, 0, 1), 1));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(code, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // the finders, each its tile of the code growing from its middle
    const grown = easeInOut((progress - finderDelay) / DOT_SPAN), scale = FINDER_FROM + (1 - FINDER_FROM) * grown;
    const toCode = code.width / canvas.width;
    ctx.globalAlpha = fade * grown;
    for(const [x, y, width, height] of grown > 0 ? finders : []) {
      ctx.drawImage(
        code, x * toCode, y * toCode, width * toCode, height * toCode,
        x + width * (1 - scale) / 2, y + height * (1 - scale) / 2, width * scale, height * scale
      );
    }

    ctx.fillStyle = ink;
    for(const [key, path] of dots) {
      ctx.globalAlpha = key / 16;
      ctx.fill(path);
    }

    ctx.globalAlpha = 1;
    return false;
  };

  let progress = 0;
  draw(progress);

  return {
    canvas,
    replace(next: HTMLCanvasElement, nextModules: QrModules, nextInk: string) {
      const same = nextModules.count === modules.count && nextModules.dark.every((dark, index) => dark === modules.dark[index]);
      code = next;
      ink = nextInk;
      modules = nextModules;
      if(!same) prepare();
      draw(progress);
    },
    play(onDone: () => void) {
      let cancel: () => void, start: number;
      const step = (now: number) => {
        start ??= now; // the clock starts on the first frame drawn
        progress = introProgress(now - start);
        if(draw(progress)) {
          cancel = undefined;
          onDone();
          return;
        }

        cancel = nodeFrame(canvas, step);
      };
      cancel = nodeFrame(canvas, step);
      return () => cancel?.();
    }
  };
}
