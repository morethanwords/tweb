import clamp from '@helpers/number/clamp';
import wheelDeltaToPixels from '@helpers/dom/wheelDeltaToPixels';
import type {ExpandedCropRect} from '@components/mediaEditor/native/desktopExpandedCrop';
import type {NumberPair} from '@components/mediaEditor/types';
import {mapPreviewAffine} from '@components/mediaEditor/canvas/previewAffine';

/** GATED ordinary Paint geometry only. Source proof: tmp/media-editor-desktop-camera-qt.md.
 * Qt6.11.2 AlignCenter + hidden integer scrollbars. No document/history/DOM/DPR.
 * The former continuous API was replaced: its only callers were this module's tests.
 * Animated residual setTransform/recalculate/anchor transitions are NOT supported.
 * Never compose a free residual translation and label it native-equivalent.
 *
 * The mounted preview controller supplies fitted/outer logical viewport geometry;
 * previewAffine composes this complete preview affine including viewport origin;
 * pointer normalization inverts that SAME affine. Apply DPR only at rendering.
 * Keep saved geometry/legacy resize compensation separate; context mediaState,
 * history and finalRender/getResultTransform must NEVER consume the camera.
 * Production activation stays disabled pending complete consumer migration and review.
 * Fixed-crop item transforms excluded.
 */
export type DesktopPaintAffine = readonly [number, number, number, number, number, number];
export type DesktopPaintCameraGeometry = Readonly<{
  /** Fitted Paint rectangle in parent coordinates; viewport coordinates start at zero. */
  viewport: ExpandedCropRect;
  outerViewport?: ExpandedCropRect;
  /** Explicit view sceneRect (source union crop), not itemsBoundingRect. */
  scene: ExpandedCropRect;
  /** Fitted source-to-view matrix [a,b,c,d,e,f], including media rotation/flip.
   * Native applyViewTransform has no translation; translated matrices are accepted
   * as explicit geometry, not as an animated-residual implementation. */
  transform: DesktopPaintAffine;
  direction?: 'ltr' | 'rtl';
}>;
export type DesktopPaintAxis = {minimum: number; maximum: number; indent: number; value: number};
type Point = readonly [number, number];
const epsilon = .0001;
const intMin = -2147483648, intMax = 2147483647;

function finite(value: number) {
  if(typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid Paint camera number');
  return value;
}

function point(value: Point): NumberPair {
  if(!Array.isArray(value) || value.length !== 2) throw new Error('Invalid Paint camera point');
  return [finite(value[0]), finite(value[1])];
}

function keys(value: object, allowed: string[]) {
  if(!value || typeof value !== 'object' || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error('Unknown Paint camera input');
  }
}

function rect(value: ExpandedCropRect, viewport = false): ExpandedCropRect {
  keys(value, ['x', 'y', 'width', 'height']);
  const {x, y, width, height} = value;
  [x, y, width, height, x + width, y + height].forEach(finite);
  if(width <= 0 || height <= 0 || (viewport && ![x, y, width, height].every(Number.isInteger))) {
    throw new Error('Invalid Paint camera extent');
  }
  return {x, y, width, height};
}

function geometry(value: DesktopPaintCameraGeometry): DesktopPaintCameraGeometry {
  keys(value, ['viewport', 'outerViewport', 'scene', 'transform', 'direction']);
  const matrix = value.transform;
  if(!Array.isArray(matrix) || matrix.length !== 6) throw new Error('Invalid Paint affine');
  matrix.forEach(finite);
  if(!finite(matrix[0] * matrix[3] - matrix[1] * matrix[2])) throw new Error('Singular Paint affine');
  if(value.direction !== undefined && value.direction !== 'ltr' && value.direction !== 'rtl') throw new Error('Invalid Paint direction');
  return {viewport: rect(value.viewport, true), outerViewport: value.outerViewport && rect(value.outerViewport, true),
    scene: rect(value.scene), transform: [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]], direction: value.direction || 'ltr'};
}

/** QGraphicsView's private rb, NOT qRound: negative half ties go toward +infinity. */
export function desktopPaintRangeRound(value: number) {
  return Math.floor(clamp(finite(value), intMin, intMax) + .5);
}

// Existing qtRound in desktopExpandedCrop is private and that file is crop-owned.
// No shared exported numeric helper exists. qRound here is restricted to int32-safe
// camera coordinates, not the crop helper's saturating rectangle conversion.
function qRound(value: number) {
  if(!Number.isFinite(value) || Math.abs(value) > intMax / 4) throw new Error('Unsupported Paint center range');
  return Math.sign(value) * Math.floor(Math.abs(value) + .5) || 0;
}
export {qRound as desktopPaintLayoutRound};

function map(matrix: DesktopPaintAffine, p: Point): NumberPair {
  return point(mapPreviewAffine(matrix, p));
}

const center = (r: ExpandedCropRect): NumberPair => [r.x + r.width / 2, r.y + r.height / 2];

/** Explicit WEB policy, NOT Qt: shared 16px/line conversion, page = viewport axis,
 * 100px = 120 angle units, reverse DOM sign. No modifier reinterpretation. */
export function desktopPaintWheelAngles(input: {deltaX: number; deltaY: number; deltaMode: number}, viewport: ExpandedCropRect): NumberPair {
  keys(input, ['deltaX', 'deltaY', 'deltaMode']);
  const bounds = rect(viewport);
  if(![0, 1, 2].includes(input.deltaMode)) throw new Error('Unknown Paint wheel deltaMode');
  const convert = (delta: number, size: number) => finite(-wheelDeltaToPixels(finite(delta), input.deltaMode, size) * 1.2) || 0;
  return [convert(input.deltaX, bounds.width), convert(input.deltaY, bounds.height)];
}

export default function createDesktopPaintCamera(initial: DesktopPaintCameraGeometry, initialZoom = 1) {
  let bounds = geometry(initial);
  let zoom = checkedZoom(initialZoom);
  let axes: [DesktopPaintAxis, DesktopPaintAxis] = [emptyAxis(), emptyAxis()];
  let lastCenter = center(bounds.scene);
  let panPoint: NumberPair;

  function checkedZoom(value: number) {
    if(finite(value) < 1 || value > 8) throw new Error('Invalid Paint zoom');
    return value;
  }
  function emptyAxis(): DesktopPaintAxis {
    return {minimum: 0, maximum: 0, indent: 0, value: 0};
  }
  function viewport() {
    return zoom - 1 > epsilon && bounds.outerViewport ? bounds.outerViewport : bounds.viewport;
  }
  function matrix(): DesktopPaintAffine {
    const m = bounds.transform;
    return [m[0] * zoom, m[1] * zoom, m[2] * zoom, m[3] * zoom, m[4] * zoom, m[5] * zoom];
  }
  function scroll(): NumberPair {
    const [x, y] = axes;
    return [Math.trunc(-x.indent) + (bounds.direction === 'rtl'
      ? (x.indent === 0 ? x.minimum + x.maximum - x.value : 0) : x.value), Math.trunc(y.value - y.indent)];
  }
  function toViewport(value: Point): NumberPair {
    const p = map(matrix(), point(value)), s = scroll();
    return [p[0] - s[0], p[1] - s[1]];
  }
  function toScene(value: Point): NumberPair {
    const p = point(value), s = scroll(), m = matrix();
    // Preserve Qt model arithmetic order at integer-rounding boundaries.
    const x = p[0] + s[0] - m[4], y = p[1] + s[1] - m[5];
    const det = m[0] * m[3] - m[1] * m[2];
    return point([(m[3] * x - m[2] * y) / det, (m[0] * y - m[1] * x) / det]);
  }
  function recalculate() {
    const r = bounds.scene, m = matrix(), v = viewport();
    const corners = [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]
      .map(p => map(m, p as NumberPair));
    const next = [v.width, v.height].map((length, index) => {
      const start = Math.min(...corners.map(p => p[index])), end = Math.max(...corners.map(p => p[index]));
      // Avoid pretending JS reproduces Qt's out-of-range qRound/int arithmetic.
      if(Math.max(Math.abs(start), Math.abs(end), length) > intMax / 4) throw new Error('Unsupported Paint coordinate range');
      const minimum = desktopPaintRangeRound(start), maximum = desktopPaintRangeRound(end - length);
      if(minimum >= maximum) return {minimum: 0, maximum: 0, indent: Math.floor(length / 2) - (start + end) / 2, value: 0};
      const old = axes[index];
      return {minimum, maximum, indent: 0,
        value: clamp(old.indent !== 0 ? Math.trunc(-old.indent) : old.value, minimum, maximum)};
    });
    axes = next as [DesktopPaintAxis, DesktopPaintAxis];
  }
  function centerOn(value: Point) {
    const p = point(value), mapped = map(matrix(), p), v = viewport();
    const desired = [qRound(mapped[0] - v.width / 2), qRound(mapped[1] - v.height / 2)];
    axes.forEach((axis, index) => {
      if(axis.indent !== 0) return;
      axis.value = clamp(index === 0 && bounds.direction === 'rtl'
        ? axis.minimum + axis.maximum - desired[index] : desired[index], axis.minimum, axis.maximum);
    });
    lastCenter = p;
    return snapshot();
  }
  function snapshot() {
    const m = matrix(), s = scroll(), v = viewport();
    return {zoom, axes: axes.map(axis => ({...axis})), viewport: {...v},
      transform: [...m] as number[], previewTransform: [m[0], m[1], m[2], m[3], m[4] - s[0] + v.x, m[5] - s[1] + v.y],
      scroll: s, lastCenter: [...lastCenter], panning: !!panPoint};
  }
  function transaction(action: () => void) {
    const saved = {bounds, zoom, axes: axes.map(axis => ({...axis})) as typeof axes, lastCenter, panPoint};
    try {
      action();
    } catch(error) {
      ({bounds, zoom, axes, lastCenter, panPoint} = saved);
      throw error;
    }
    return snapshot();
  }
  function zoomBy(factor: number, at: Point) {
    const focus = point(at);
    if(!focus.every(Number.isInteger) || finite(factor) <= 0) throw new Error('Invalid Paint zoom event');
    const next = clamp(finite(zoom * factor), 1, 8);
    if(Math.abs(next - zoom) < epsilon) return snapshot();
    const anchor = toScene(focus);
    return transaction(() => {
      zoom = next;
      recalculate();
      // Nonanimated final centerOn algebra. The transient AnchorViewCenter pass
      // cancels out of this expression; no claim about intermediate GUI events.
      const v = viewport(), m = matrix(), a = map(m, anchor);
      const desired = [a[0] + Math.floor(v.width / 2) - focus[0], a[1] + Math.floor(v.height / 2) - focus[1]] as NumberPair;
      const s = scroll();
      centerOn(toScene([desired[0] - s[0], desired[1] - s[1]]));
    });
  }
  recalculate();
  centerOn(lastCenter);

  return {
    snapshot, toScene, toViewport, centerOn,
    reset() {
      return transaction(() => {
        zoom = 1;
        panPoint = undefined;
        recalculate();
        centerOn(center(bounds.scene));
      });
    },
    wheel(angles: Point, at: Point) {
      const [x, y] = point(angles);
      return zoomBy(Math.pow(1.15, (y || x) / 120), at);
    },
    /** Immediate only. Animated native residual transitions deliberately absent. */
    nativeGesture(value: number, at: Point) {
      return zoomBy(1 + finite(value), at);
    },
    pointerDown(button: number, at: Point) {
      if(!Number.isInteger(button) || button < 0 || button > 4) throw new Error('Unknown Paint pointer button');
      const p = point(at);
      if(!p.every(Number.isInteger)) throw new Error('Noninteger Paint pointer');
      if(button === 1) panPoint = zoom > 1 ? p : undefined;
      return snapshot();
    },
    pointerMove(at: Point) {
      const p = point(at);
      if(!p.every(Number.isInteger)) throw new Error('Noninteger Paint pointer');
      if(panPoint) {
        if(zoom > 1) {
          axes.forEach((axis, i) => axis.value = clamp(axis.value - (p[i] - panPoint[i]), axis.minimum, axis.maximum));
          const v = viewport();
          lastCenter = toScene([v.width / 2, v.height / 2]);
        }
        panPoint = p;
      }
      return snapshot();
    },
    endPan() {
      panPoint = undefined;
      return snapshot();
    },
    /** Desktop applyTransform's final layout result, not arbitrary Qt resizeEvent.
     * Recalculate changed sceneRect on OLD viewport/M before capturing QRect center. */
    resize(value: DesktopPaintCameraGeometry) {
      const next = geometry(value);
      return transaction(() => {
        bounds = {...bounds, scene: next.scene};
        recalculate();
        const oldViewport = viewport();
        const captured = zoom === 1 ? center(next.scene)
          : toScene([Math.trunc((oldViewport.width - 1) / 2), Math.trunc((oldViewport.height - 1) / 2)]);
        bounds = next;
        recalculate();
        centerOn(captured);
        panPoint = undefined;
      });
    }
  };
}
