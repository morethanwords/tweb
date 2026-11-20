import {rgbToHsv, type ColorRgb} from '@helpers/color';
import clamp from '@helpers/number/clamp';

/** Geometry only; never interpret legacy cropOffset/scale as this descriptor.
 * Desktop authority: a532622be61ffb811c34311583c9fd4828786833,
 * editor/editor_crop.cpp:31–81,369–466,487–631; photo_editor_common.cpp:123–144.
 * Physical image coordinates do not change with interface direction.
 */
export type ExpandedCropRect = Readonly<{x: number; y: number; width: number; height: number}>;
type Point = Readonly<{x: number; y: number}>;
type Size = readonly [number, number];
export type CropEdge = 'left' | 'right' | 'top' | 'bottom' |
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'move';
export type DesktopExpandedCrop = {
  version: 'desktop-crop-v1';
  sourceSize: Size;
  crop: ExpandedCropRect;
  background: 'desktop-source-gradient-v1';
};

const right = (r: ExpandedCropRect) => r.x + r.width;
const bottom = (r: ExpandedCropRect) => r.y + r.height;
const edgesRect = (x: number, y: number, r: number, b: number): ExpandedCropRect => ({x, y, width: r - x, height: b - y});

function union(a: ExpandedCropRect, b: ExpandedCropRect) {
  return edgesRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(right(a), right(b)), Math.max(bottom(a), bottom(b)));
}

function fitInside(crop: ExpandedCropRect, bounds: ExpandedCropRect): ExpandedCropRect {
  const width = Math.min(crop.width, bounds.width), height = Math.min(crop.height, bounds.height);
  return {x: clamp(crop.x, bounds.x, right(bounds) - width), y: clamp(crop.y, bounds.y, bottom(bounds) - height), width, height};
}

/** Qt v6.11.2 qnumeric.h qSaturateRound: ties away from zero, unlike Math.round.
 * This is the Qt 6 version selected by the Desktop pin's build/qt_version.py.
 */
function qtRound(value: number) {
  if(Number.isNaN(value)) throw new Error('Invalid native rectangle coordinate');
  return Math.trunc(clamp(value < 0 ? value - .5 : value + .5, -2147483648, 2147483647)) || 0;
}

/** Qt v6.11.2 src/corelib/tools/qrect.h QRectF::toRect(). Width/height
 * include HALF the origin-rounding residual, not just rounded dimensions.
 */
export function desktopCropToIntegerRect(rect: ExpandedCropRect): ExpandedCropRect {
  const x = qtRound(rect.x), y = qtRound(rect.y);
  return {x, y, width: qtRound(rect.width + (rect.x - x) / 2), height: qtRound(rect.height + (rect.y - y) / 2)};
}

export function desktopExpansionBounds(image: ExpandedCropRect, crop: ExpandedCropRect, available: ExpandedCropRect) {
  const u = union(image, crop);
  return edgesRect(
    Math.max(available.x, Math.min(right(u) - 2 * image.width, u.x)),
    Math.max(available.y, Math.min(bottom(u) - 2 * image.height, u.y)),
    Math.min(right(available), Math.max(u.x + 2 * image.width, right(u))),
    Math.min(bottom(available), Math.max(u.y + 2 * image.height, bottom(u)))
  );
}

/** available is already inset by native handle margins (nominally 5px).
 * pointer is an integer native/display position; fractional Web events are truncated.
 * fixedAspectRatio is Desktop's ORIGINAL crop width/height at down, even at 90°.
 * Expansion permission, source, crop, bounds and ratio are captured, never read on move.
 */
export function beginDesktopCropDrag(args: {
  image: ExpandedCropRect;
  crop: ExpandedCropRect;
  available: ExpandedCropRect;
  pointer: Point;
  edge: CropEdge;
  ctrl: boolean;
  expansionAllowed: boolean;
  fixedAspectRatio?: number;
}) {
  const image = {...args.image}, crop = {...args.crop};
  const edge = args.edge, ratio = args.fixedAspectRatio;
  if(ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0 || !edge.includes('-') && edge !== 'move')) {
    throw new Error('Desktop fixed-aspect crop requires a positive ratio and a corner or interior');
  }
  const expanding = args.ctrl && args.expansionAllowed && edge !== 'move';
  const bounds = expanding ? desktopExpansionBounds(image, crop, args.available) : union(image, crop);
  if(bounds.width <= 0 || bounds.height <= 0) throw new Error('No available crop room');
  const left = edge.includes('left'), top = edge.includes('top');
  const hasRight = edge.includes('right'), hasBottom = edge.includes('bottom');
  const borders = {
    left: Math.trunc(bounds.x) - Math.trunc(crop.x),
    top: Math.trunc(bounds.y) - Math.trunc(crop.y),
    right: Math.trunc(right(bounds)) - Math.trunc(right(crop)),
    bottom: Math.trunc(bottom(bounds)) - Math.trunc(bottom(crop))
  };
  if(ratio && edge !== 'move') {
    const xSign = left ? -1 : 1, ySign = top ? -1 : 1;
    const xSide = left ? 'left' : 'right', ySide = top ? 'top' : 'bottom';
    const room = Math.min(xSign * borders[xSide], ySign * borders[ySide] * ratio);
    borders[xSide] = Math.trunc(xSign * room);
    borders[ySide] = Math.trunc(ySign * room / ratio);
  }
  const start = {x: Math.trunc(args.pointer.x), y: Math.trunc(args.pointer.y)};
  return {
    expanding,
    bounds: {...bounds},
    update(pointer: Point): ExpandedCropRect {
      let dx = Math.trunc(pointer.x) - start.x, dy = Math.trunc(pointer.y) - start.y;
      if(edge === 'move') {
        return fitInside({...crop, x: crop.x + clamp(dx, borders.left, borders.right), y: crop.y + clamp(dy, borders.top, borders.bottom)}, bounds);
      }
      const xFactor = left ? 1 : -1, yFactor = top ? 1 : -1;
      if(ratio) {
        const sign = xFactor * yFactor;
        if(ratio !== 1) dy = Math.trunc(dx / ratio * sign);
        else if(dx * xFactor < dy * yFactor) dy = dx * sign;
        else dx = dy * sign;
      }
      const minW = ratio && ratio > 1 ? 20 * ratio : 20;
      const minH = ratio && ratio < 1 ? 20 / ratio : 20;
      const xInward = Math.min(crop.width - minW, left ? right(image) - minW - crop.x : right(crop) - minW - image.x);
      const yInward = Math.min(crop.height - minH, top ? bottom(image) - minH - crop.y : bottom(crop) - minH - image.y);
      const xMin = xFactor * Math.trunc(Math.max(xInward, 0));
      const yMin = yFactor * Math.trunc(Math.max(yInward, 0));
      dx = clamp(dx, left ? borders.left : xMin, left ? xMin : borders.right);
      dy = clamp(dy, top ? borders.top : yMin, top ? yMin : borders.bottom);
      return edgesRect(
        Math.max(crop.x + (left ? dx : 0), bounds.x),
        Math.max(crop.y + (top ? dy : 0), bounds.y),
        Math.min(right(crop) + (hasRight ? dx : 0), right(bounds)),
        Math.min(bottom(crop) + (hasBottom ? dy : 0), bottom(bounds))
      );
    }
  };
}

export function selectDesktopCropRatio(image: ExpandedCropRect, crop: ExpandedCropRect, ratio: number): ExpandedCropRect {
  if(!Number.isFinite(ratio)) throw new Error('Invalid crop ratio');
  if(ratio <= 0) return {...crop};
  const bounds = union(image, crop);
  const width = Math.min(bounds.width, bounds.height * ratio), height = width / ratio;
  return fitInside({x: crop.x + (crop.width - width) / 2, y: crop.y + (crop.height - height) / 2, width, height}, bounds);
}

function quarterTurn(angle: number) {
  if(!Number.isInteger(angle / 90)) throw new Error('desktop-crop-v1 supports quarter turns only');
  return ((angle % 360) + 360) % 360;
}

/** Maps a rectangle through Qt scale(-1,1).rotate(angle), with the mapped
 * holder translated back to origin. Reflection is AFTER rotation (Qt order).
 */
export function mapDesktopCropRect(rect: ExpandedCropRect, holder: Size, angle: number, flipped = false): ExpandedCropRect {
  const turn = quarterTurn(angle), [w, h] = holder;
  let result: ExpandedCropRect;
  if(turn === 90) result = {x: h - bottom(rect), y: rect.x, width: rect.height, height: rect.width};
  else if(turn === 180) result = {x: w - right(rect), y: h - bottom(rect), width: rect.width, height: rect.height};
  else if(turn === 270) result = {x: rect.y, y: w - right(rect), width: rect.height, height: rect.width};
  else result = {...rect};
  return flipped ? {...result, x: (turn % 180 ? h : w) - right(result)} : result;
}

export function desktopCropToDisplay(crop: ExpandedCropRect, sourceSize: Size, image: ExpandedCropRect, angle = 0, flipped = false) {
  const mapped = mapDesktopCropRect(crop, sourceSize, angle, flipped);
  const turn = quarterTurn(angle);
  const sx = image.width / sourceSize[turn % 180 ? 1 : 0], sy = image.height / sourceSize[turn % 180 ? 0 : 1];
  return {x: image.x + mapped.x * sx, y: image.y + mapped.y * sy, width: mapped.width * sx, height: mapped.height * sy};
}

/** Floating inverse; call desktopCropToIntegerRect only on commit/save. */
export function desktopCropFromDisplay(crop: ExpandedCropRect, sourceSize: Size, image: ExpandedCropRect, angle = 0, flipped = false) {
  const turn = quarterTurn(angle);
  const holder: Size = turn % 180 ? [sourceSize[1], sourceSize[0]] : sourceSize;
  let mapped = {x: (crop.x - image.x) * holder[0] / image.width, y: (crop.y - image.y) * holder[1] / image.height,
    width: crop.width * holder[0] / image.width, height: crop.height * holder[1] / image.height};
  if(flipped) mapped = {...mapped, x: holder[0] - right(mapped)};
  return mapDesktopCropRect(mapped, holder, -angle);
}

/** Natural native extent/placement, BEFORE Web's explicit v1 client output limits. */
export function desktopExpandedCropPlacement(crop: ExpandedCropRect, sourceSize: Size, angle = 0, flipped = false) {
  const turn = quarterTurn(angle);
  return {
    size: (turn % 180 ? [crop.height, crop.width] : [crop.width, crop.height]) as Size,
    source: mapDesktopCropRect({x: -crop.x, y: -crop.y, width: sourceSize[0], height: sourceSize[1]}, [crop.width, crop.height], angle, flipped),
    scene: union({x: 0, y: 0, width: sourceSize[0], height: sourceSize[1]}, crop)
  };
}

/** Invalid/mismatched descriptors must not fall back to legacy interpretation. */
export function validateDesktopExpandedCrop(value: unknown, sourceSize: Size): DesktopExpandedCrop {
  const d = value as DesktopExpandedCrop;
  if(!d || d.version !== 'desktop-crop-v1') throw new Error('Unsupported expanded crop version');
  if(d.background !== 'desktop-source-gradient-v1') throw new Error('Unsupported expanded crop background');
  if(!Array.isArray(d.sourceSize) || d.sourceSize.length !== 2 ||
    !Number.isSafeInteger(d.sourceSize[0]) || d.sourceSize[0] <= 0 || d.sourceSize[0] !== sourceSize[0] ||
    !Number.isSafeInteger(d.sourceSize[1]) || d.sourceSize[1] <= 0 || d.sourceSize[1] !== sourceSize[1]) throw new Error('Expanded crop source mismatch');
  const r = d.crop;
  if(!r || ![r.x, r.y, r.width, r.height, right(r), bottom(r)].every(Number.isSafeInteger) || r.width <= 0 || r.height <= 0 ||
    right(r) <= 0 || bottom(r) <= 0 || r.x >= sourceSize[0] || r.y >= sourceSize[1]) throw new Error('Invalid expanded crop rectangle');
  return {version: d.version, background: d.background, sourceSize: [d.sourceSize[0], d.sourceSize[1]], crop: {...r}};
}

/** media/media_video_canvas.cpp:17–29 at the Desktop pin above.
 * Floating HSV contract only: no QColor 16-bit quantization / raster-byte claim.
 * Hue uses the existing helper's degrees; achromatic hue is immaterial at s=0.
 */
export function adaptDesktopCanvasHsv(h: number, s: number, v: number) {
  v = clamp(v - .05, .15, .85);
  if(s > .1 && s <= .95) {
    if(s <= .5) s = Math.min(s + .2, 1);
    else if(s > .8) s = Math.max(s - .4, 0);
  }
  return {h, s, v, alpha: 1};
}

export function adaptDesktopCanvasSample(rgb: ColorRgb) {
  return adaptDesktopCanvasHsv(...rgbToHsv(...rgb));
}

/** Qt v6.11.2 QSize::scaled KeepAspectRatio uses integer division, including
 * its useHeight decision. Smooth image resampling itself is deliberately not here.
 * Caller must sample ORIGINAL decoded source, not adjustments/expanded canvas.
 */
export function desktopCanvasSamplePlan(sourceSize: Size) {
  const [w, h] = sourceSize;
  if(!sourceSize.every(n => Number.isSafeInteger(n) && n > 0) || Math.max(w, h) > Number.MAX_SAFE_INTEGER / 240) {
    throw new Error('Invalid canvas sample source');
  }
  const rw = Math.trunc(240 * w / h);
  const width = rw <= 240 ? rw : 240, height = rw <= 240 ? 240 : Math.trunc(240 * h / w);
  if(!width || !height) throw new Error('Empty native canvas sample');
  return {width, height, x: Math.trunc(width / 2), topY: Math.trunc(height * .1), bottomY: Math.min(Math.trunc(height * .9), height - 1), resampling: 'qt-smooth' as const};
}
