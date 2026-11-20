import type {NumberPair} from '@components/mediaEditor/types';
import type {FinalTransform} from '@components/mediaEditor/canvas/useFinalTransform';
import invertCanvasTransform from '@components/mediaEditor/canvas/invertCanvasTransform';

/** Explicit WEB policy, not Android hardware detection or device pixel parity.
 * LPhotoPaintView.getPaintingSize at 21f7d109: choose the low-tier cap, with
 * Java float intermediates and floor, including upscaling small inputs.
 * Density 1 means one CSS pixel per dp for interaction constants, NOT DPR.
 */
export const androidPaintWebPolicy = Object.freeze({cap: 1280, density: 1});

export function androidPaintingSize(source: readonly [number, number]): NumberPair {
  if(!source.every(n => Number.isInteger(n) && n > 0 && n <= 0x7fffffff)) throw new RangeError('Invalid paint source dimensions');
  const f = Math.fround;
  let width: number = androidPaintWebPolicy.cap;
  let height = Math.floor(f(f(width * f(source[1])) / f(source[0])));
  if(height > androidPaintWebPolicy.cap) {
    height = androidPaintWebPolicy.cap;
    width = Math.floor(f(f(height * f(source[0])) / f(source[1])));
  }
  if(width < 1 || height < 1) throw new RangeError('Degenerate painting dimensions');
  return [width, height];
}

/** Web rectangular edge alignment, including the floor-induced aspect discrepancy.
 * Both strokes and shapes have logical downward Y; only present() inverts rows.
 * Flips belong to the source image, not a second paint transform.
 */
export function sourceToAndroidPainting(point: NumberPair, source: readonly number[], painting: readonly number[]): NumberPair {
  return [(point[0] / source[0] + .5) * painting[0], (point[1] / source[1] + .5) * painting[1]];
}

export function androidPaintingToSource(point: NumberPair, source: readonly number[], painting: readonly number[]): NumberPair {
  return [(point[0] / painting[0] - .5) * source[0], (point[1] / painting[1] - .5) * source[1]];
}

export function viewToAndroidPainting(pointCSS: NumberPair, canvasCSS: NumberPair, dpr: number, transform: FinalTransform,
  source: readonly number[], painting: readonly number[]): NumberPair {
  return sourceToAndroidPainting(invertCanvasTransform([
    (pointCSS[0] - canvasCSS[0] / 2) * dpr,
    (pointCSS[1] - canvasCSS[1] / 2) * dpr
  ], transform), source, painting);
}

/** Shared preview/export draw: input canvas has already been presented upright.
 * No readback, additional Y inversion, fitted zoom substitution or DPR inference.
 */
export function drawAndroidPainting(ctx: CanvasRenderingContext2D, paint: HTMLCanvasElement,
  source: readonly number[], transform: FinalTransform) {
  const topLeft = androidPaintingToSource([0, 0], source, [paint.width, paint.height]);
  const bottomRight = androidPaintingToSource([paint.width, paint.height], source, [paint.width, paint.height]);
  ctx.save();
  ctx.translate(ctx.canvas.width / 2 + transform.translation[0], ctx.canvas.height / 2 + transform.translation[1]);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(paint, topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
  ctx.restore();
}
