// Timing and geometry of the send flow (WalletFlow in the iOS demo): the gem's
// throw into the new history row, the row's lift, the hit and the settle.

import {spring, impact} from '@components/wallet/visual/motion';
import {Vec2} from '@components/wallet/visual/math';

/** The flight from the screen into the row, seconds. */
export const TRAVEL = 0.5;
/** How long the demo transfer goes after the landing — real transfers complete on confirmation. */
export const PENDING = 3.0;
/** The gem turns into the icon this long after the completion. */
export const MORPH_AT = 0.32;
export const STAR_SPAN = 1.25;
/** The gem in the row spins fast. */
export const ROW_SPIN = 6.5;
/** The gem next to the amount while the transfer goes. */
export const PENDING_GEM = 34;
/** The gem's visible width against its slot. */
export const GEM_INK = 1.06;
export const LIFT_SCALE = 0.035;
export const LIFT_RISE = 2;
/**
 * How far the lifted row's plate goes beyond the row itself: history rows
 * have a padding of 8 — this way it goes 6 beyond the white block's edges.
 */
export const PLATE_OUT_X = 8.5;
export const PLATE_OUT_Y = 3;
export const BIG_SCALE = 0.33;
export const ROW_HEIGHT = 76;
/** Side of the flying gem's (and the row gem's) square canvas, CSS px. */
export const FLY_CANVAS = 150;
/** The row is inserted this long after the throw, while the screen slides away. */
export const ROW_DELAY = 0.1;

/**
 * The throw: hops `apex` above the start (and above the target, if it is
 * higher) and falls exactly into the target along a parabola, gaining speed.
 */
export function toss(a: Vec2, b: Vec2, apex: number, t: number): Vec2 {
  const d = b[1] - a[1];
  const rise = apex + Math.max(0, -d);
  const B = -2 * rise - 2 * Math.sqrt(rise * rise + rise * d);
  const C = d - B;
  return [a[0] + (b[0] - a[0]) * t, a[1] + B * t + C * t * t];
}

/**
 * The row's lift: 0 — in the list, 1 — lifted. It rises on a spring with an
 * overshoot and settles back the same way, sagging a little.
 */
export function rowLift(now: number, liftStart: number, settleStart: number): number {
  let v = spring(now - liftStart);
  if(settleStart !== null) v *= 1 - spring(now - settleStart, 8, 13);
  return v;
}

/** 1 — the pending layout (big centred amount), falling to 0 once the transfer completes. */
export function rowBig(now: number, settleStart: number): number {
  if(settleStart === null) return 1;
  const u = Math.min(1, Math.max(0, (now - settleStart) / 0.3));
  return Math.pow(1 - u, 3);
}

/** The hit of the landing gem, px down. */
export function rowDip(now: number, landStart: number): number {
  return 5 * impact(now - landStart);
}

/**
 * The gem's place in the row, in the row's coordinates: while the transfer
 * goes — after the big amount in the row's middle, then — in the icon's place,
 * at the row's inline end (the left one with `rtl`).
 */
export function gemSlot(rowWidth: number, big: number, rowHeight = ROW_HEIGHT, rtl?: boolean): Vec2 {
  const w = rowWidth;
  const pending: Vec2 = [w - 12 - PENDING_GEM / 2, rowHeight / 2];
  const normal: Vec2 = [w - 12 - 7 + 0.4, 8 + 10.5];
  const x = normal[0] + (pending[0] - normal[0]) * big;
  return [rtl ? w - x : x, normal[1] + (pending[1] - normal[1]) * big];
}
