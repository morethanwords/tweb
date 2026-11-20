import type {FinalTransform} from '@components/mediaEditor/canvas/useFinalTransform';
import type {NumberPair} from '@components/mediaEditor/types';
import type {ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';

/** [a,b,c,d,e,f], source-centred unflipped points -> physical LTR surface CSS px.
 * Image flips remain a separate source-domain operation. No document/export state.
 */
export type PreviewAffine = readonly [number, number, number, number, number, number];
export type PaintPreviewAffine = Readonly<{
  base: PreviewAffine;
  forward: PreviewAffine;
  inverse: PreviewAffine;
  correction: PreviewAffine;
  sourceBounds?: ExpandedCropRect;
}>;

export function mapPreviewAffine(m: PreviewAffine, p: readonly [number, number]): NumberPair {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function multiplyPreviewAffine(a: PreviewAffine, b: PreviewAffine): PreviewAffine {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

export function invertPreviewAffine(m: PreviewAffine): PreviewAffine {
  const det = m[0] * m[3] - m[1] * m[2];
  if(!m.every(Number.isFinite) || !Number.isFinite(det) || !det) throw new Error('Invalid preview affine');
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  const result: PreviewAffine = [a, b, c, d, -a * m[4] - c * m[5], -b * m[4] - d * m[5]];
  if(!result.every(Number.isFinite)) throw new Error('Invalid preview affine inverse');
  return result;
}

export function basePreviewAffine(transform: FinalTransform, size: NumberPair, ratio: number): PreviewAffine {
  const scale = transform.scale / ratio;
  const c = Math.cos(transform.rotation) * scale, s = Math.sin(transform.rotation) * scale;
  return [c, s, -s, c, size[0] / 2 + transform.translation[0] / ratio, size[1] / 2 + transform.translation[1] / ratio];
}

export function createPaintPreviewAffine(base: PreviewAffine, forward: PreviewAffine): PaintPreviewAffine {
  const inverse = invertPreviewAffine(forward);
  return {base, forward, inverse, correction: multiplyPreviewAffine(forward, invertPreviewAffine(base))};
}

/** A vector, never a point: translations must not leak into drag/resize deltas. */
export function mapPreviewVector(m: PreviewAffine, vector: NumberPair): NumberPair {
  return [m[0] * vector[0] + m[2] * vector[1], m[1] * vector[0] + m[3] * vector[1]];
}

/** Image shader consumes source-centred already-flipped points, output device px. */
export function previewRasterMatrix(m: PreviewAffine, ratio: number): number[] {
  return [m[0] * ratio, m[1] * ratio, 0, m[2] * ratio, m[3] * ratio, 0, m[4] * ratio, m[5] * ratio, 1];
}

export function projectPreviewRect(m: PreviewAffine, rect: ExpandedCropRect): ExpandedCropRect {
  const points = [[rect.x, rect.y], [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .map(([x, y]) => mapPreviewAffine(m, [x, y]));
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
  return {x, y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y};
}

/** Local layer CSS pixels -> unflipped source units -> surface CSS pixels. */
export function previewLayerMatrix(forward: PreviewAffine, position: NumberPair, rotation: number, scale: number, ratio: number): PreviewAffine {
  const c = Math.cos(rotation) * scale * ratio, s = Math.sin(rotation) * scale * ratio;
  return multiplyPreviewAffine(forward, [c, s, -s, c, position[0], position[1]]);
}

export function previewCSSMatrix(matrix: PreviewAffine): string {
  return `matrix(${matrix.join(',')})`;
}
