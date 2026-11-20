import clamp from '@helpers/number/clamp';
import {distance} from '@components/mediaEditor/utils';
import type {EditorShape, NumberPair} from '@components/mediaEditor/types';

/** ShapeInput.java / Shape.java / RenderView.java, official Telegram-Android
 * 21f7d109da6ab3506c9e9577f98c6a38771ab335. Painting pixels, NOT CSS widths.
 * Independent of legacy ShapeLayerInfo and Desktop geometry; no version migration.
 * JS doubles reproduce the formulas, not Java float rounding or native raster pixels.
 */
export type AndroidShapeGeometry = {
  geometryVersion: 'android-shape-v1';
  shape: EditorShape;
  paintingSize: NumberPair;
  density: number;
  center: NumberPair;
  radius: NumberPair;
  middle: NumberPair;
  rotation: number;
  thickness: number;
  rounding: number;
  arrowTriangleLength: number;
  color: string;
  filled: boolean;
  // ShapeInput.Point state: some native updates intentionally do not call set().
  // Rendering uses parameters above, never these interaction-only cached points.
  controlPoints?: AndroidShapeControl[];
};

export type AndroidShapeControlId = 'radial' | 'corner-0' | 'corner-1' | 'corner-2' | 'corner-3' | 'rotation' | 'tail' | 'head-length' | 'bend' | 'end' | 'center';
export type AndroidShapeControl = {id: AndroidShapeControlId; point: NumberPair; green: boolean; rotate: boolean};
export type AndroidShapeDrag = {control: AndroidShapeControlId | 'body'; offset: NumberPair};

const finitePoint = (point: NumberPair) => point.every(Number.isFinite);
const cornerSigns: NumberPair[] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

export function createAndroidShapeGeometry(options: {
  shape: AndroidShapeGeometry['shape']; paintingSize: NumberPair; density: number;
  normalizedWeight: number; color: string; filled: boolean;
}): AndroidShapeGeometry {
  const {shape, paintingSize, density, normalizedWeight, color, filled} = options;
  if(!finitePoint(paintingSize) || paintingSize.some(value => value <= 0) ||
    !Number.isFinite(density) || density <= 0 || !Number.isFinite(normalizedWeight) || normalizedWeight < 0 || normalizedWeight > 1) {
    throw new RangeError('Expected positive painting size/density and normalized weight in [0, 1]');
  }
  const [width, height] = paintingSize;
  const radius = Math.min(width, height) / 5;
  const thickness = width * (8 + 90 * normalizedWeight) / 2048;
  if(!Number.isFinite(thickness + density * 32)) throw new RangeError('Painting units overflow');
  return {
    geometryVersion: 'android-shape-v1', shape, paintingSize: [...paintingSize], density,
    center: [width / 2, shape === 'arrow' ? height / 3 : height / 2],
    radius: shape === 'arrow' ? [width / 2, height / 3 * 2] : [radius, radius],
    middle: shape === 'arrow' ? [width / 2 + 1, height / 2] : shape === 'bubble' ?
      [width / 2 + radius * .8, height / 2 + radius * 1.2 + thickness] : [0, 0],
    rotation: 0, thickness, rounding: Math.ceil(density * 32),
    arrowTriangleLength: shape === 'arrow' ? Math.abs(height / 3 - height / 2) : 0,
    color, filled
  };
}

function rotate(point: NumberPair, center: NumberPair, angle: number): NumberPair {
  const x = point[0] - center[0], y = point[1] - center[1];
  return [center[0] + x * Math.cos(angle) - y * Math.sin(angle), center[1] + x * Math.sin(angle) + y * Math.cos(angle)];
}

/** Point.set coordinates; rotate=true points are drawn with -shape.rotation. */
export function getAndroidShapeControls(s: AndroidShapeGeometry): AndroidShapeControl[] {
  if(s.controlPoints) return s.controlPoints;
  const [cx, cy] = s.center, [rx, ry] = s.radius;
  const controls: AndroidShapeControl[] = [];
  const add = (id: AndroidShapeControlId, point: NumberPair, green = false, rotated = true) => controls.push({id, point, green, rotate: rotated});
  if(s.shape === 'arrow') {
    const a = Math.atan2(cy - s.middle[1], cx - s.middle[0]) + Math.PI;
    add('head-length', [cx + Math.cos(a) * s.arrowTriangleLength / 5.5, cy + Math.sin(a) * s.arrowTriangleLength / 5.5]);
    add('bend', [...s.middle]);
    add('end', [...s.radius]);
    add('center', [...s.center], true, false);
  } else if(s.shape === 'circle') add('radial', [cx + rx, cy]);
  else if(s.shape === 'star') {
    const a = -Math.PI / 2 + 2 * Math.PI / 5, r = Math.min(rx, ry);
    add('radial', [cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  } else {
    cornerSigns.forEach(([x, y], i) => add(`corner-${i}` as AndroidShapeControlId, rotate([cx + x * rx, cy + y * ry], s.center, -s.rotation), false, false));
    add('rotation', [cx, cy - Math.abs(ry)], true);
    if(s.shape === 'bubble') add('tail', [...s.middle], false, false);
  }
  return controls;
}

function segmentDistance(point: NumberPair, a: NumberPair, b: NumberPair) {
  const x = b[0] - a[0], y = b[1] - a[1], norm = x * x + y * y;
  // Degenerate policy: a collapsed segment is a point, not Java's NaN.
  const t = norm ? clamp(((point[0] - a[0]) * x + (point[1] - a[1]) * y) / norm, 0, 1) : 0;
  return distance(point, [a[0] + t * x, a[1] + t * y]);
}

export function isInsideAndroidShape(s: AndroidShapeGeometry, point: NumberPair) {
  if(!finitePoint(point)) return false;
  const [x, y] = point, [cx, cy] = s.center, [rx, ry] = s.radius;
  if(s.shape === 'circle' || s.shape === 'star') return distance(point, s.center) - Math.min(rx, ry) - s.thickness / 2 < Math.ceil(30 * s.density);
  if(s.shape === 'arrow') return Math.min(segmentDistance(point, s.center, s.middle), segmentDistance(point, s.radius, s.middle)) - s.thickness / 2 < Math.min(...s.paintingSize) * .1;
  const left = cx - rx - s.thickness / 2, right = cx + rx + s.thickness / 2;
  const top = cy - ry - s.thickness / 2, bottom = cy + ry + s.thickness / 2;
  let dist: number;
  if(y > top && y < bottom) dist = x < left ? left - x : x > right ? x - right : 0;
  // PINNED QUIRK: impossible x < left && x > right, NOT the intended horizontal band.
  else if(x < left && x > right) dist = y < top ? top - y : y > bottom ? y - bottom : 0;
  else dist = Math.min(...[[left, top], [right, top], [left, bottom], [right, bottom]].map(p => distance(point, p as NumberPair)));
  if(s.shape === 'bubble') dist = Math.min(dist, segmentDistance(point, s.center, s.middle));
  // PINNED QUIRK: process() rotates tempPoint but passes unrotated dx/dy here.
  return dist < Math.ceil(30 * s.density);
}

/** Nearest drawn control wins, ties retain declaration order; body/outside follow. */
export function beginAndroidShapeDrag(s: AndroidShapeGeometry, point: NumberPair): AndroidShapeDrag | undefined {
  if(!finitePoint(point)) return;
  let nearest: AndroidShapeControl, best = Infinity;
  for(const control of getAndroidShapeControls(s)) {
    const p = control.rotate ? rotate(point, s.center, s.rotation) : point;
    const dist = distance(control.point, p);
    if(dist < Math.ceil(40 * s.density) && dist < best) { nearest = control; best = dist; }
  }
  if(!nearest && !isInsideAndroidShape(s, point)) return;
  const p = nearest?.rotate ? rotate(point, s.center, s.rotation) : point;
  const anchor = nearest?.point ?? s.center;
  return {control: nearest?.id ?? 'body', offset: [anchor[0] - p[0], anchor[1] - p[1]]};
}

/** Immutable updates; nonfinite/overflowing gestures are ignored, no universal size floor. */
export function updateAndroidShapeDrag(s: AndroidShapeGeometry, drag: AndroidShapeDrag, point: NumberPair): AndroidShapeGeometry {
  if(!finitePoint(point) || !finitePoint(drag.offset)) return s;
  const control = getAndroidShapeControls(s).find(item => item.id === drag.control);
  if(drag.control !== 'body' && !control) return s;
  const p = control?.rotate ? rotate(point, s.center, s.rotation) : point;
  const x = p[0] + drag.offset[0], y = p[1] + drag.offset[1];
  const next = {...s, center: [...s.center] as NumberPair, radius: [...s.radius] as NumberPair, middle: [...s.middle] as NumberPair};
  const [cx, cy] = s.center, [rx, ry] = s.radius;
  switch(drag.control) {
    case 'body': {
      const dx = x - cx, dy = y - cy;
      next.center = [x, y];
      if(s.shape === 'arrow') next.middle = [s.middle[0] + dx, s.middle[1] + dy];
      // Native movingPoints updates the tail BEFORE moving the centre: its
      // exclusion limit therefore still uses the OLD body, even for translation.
      if(s.shape === 'bubble') next.middle = moveAndroidTail(s, [s.middle[0] + dx, s.middle[1] + dy]);
      if(s.shape === 'arrow') next.radius = [rx + dx, ry + dy];
      break;
    }
    case 'center': next.center = [x, y]; break;
    case 'bend': next.middle = [x, y]; break;
    case 'end': next.radius = [x, y]; break;
    case 'head-length': {
      const a = Math.atan2(cy - s.middle[1], cx - s.middle[0]) + Math.PI / 2;
      const signedDistance = Math.cos(a) * (cy - y) - Math.sin(a) * (cx - x);
      // Native order matters: the distance-dependent maximum can be below 100.
      next.arrowTriangleLength = Math.min(distance(s.center, s.middle) * 5.5 / 2, Math.max(100, -signedDistance * 5.5));
      break;
    }
    case 'radial':
      next.radius = [distance(s.center, [x, y]), distance(s.center, [x, y])];
      if(s.shape === 'star') next.rotation += Math.atan2(cy - y, x - cx) + (-Math.PI / 2 + 2 * Math.PI / 5);
      break;
    case 'rotation': next.rotation += Math.atan2(cy - y, x - cx) - Math.PI / 2; break;
    case 'tail': next.middle = moveAndroidTail(s, [x, y]); break;
    default: {
      const [sx, sy] = cornerSigns[Number(drag.control.slice(-1))];
      const opposite = rotate([cx - sx * rx, cy - sy * ry], s.center, -s.rotation);
      const angle = Math.PI - Math.atan2(y - opposite[1], x - opposite[0]) - s.rotation;
      const length = distance([x, y], opposite);
      next.radius = [Math.abs(Math.cos(angle) * length) / 2, Math.abs(Math.sin(angle) * length) / 2];
      next.center = [(x + opposite[0]) / 2, (y + opposite[1]) / 2];
    }
  }
  if(![...next.center, ...next.radius, ...next.middle, next.rotation, next.arrowTriangleLength].every(Number.isFinite)) return s;
  // Preserve Point.set/update ordering, including source's lagging handles when
  // center.update() refreshes the other points before changing shape.center.
  const fresh = (shape: AndroidShapeGeometry) => getAndroidShapeControls({...shape, controlPoints: undefined});
  const previous = getAndroidShapeControls(s);
  if(drag.control === 'body' || drag.control === 'center') {
    const beforeCenter = {...next, center: s.center};
    next.controlPoints = fresh(beforeCenter).map(c => c.id === 'center' ? {...c, point: next.center} : c);
  } else if(drag.control.startsWith('corner-') || drag.control === 'radial' && s.shape === 'star') next.controlPoints = fresh(next);
  else if(drag.control === 'radial') next.controlPoints = previous.map(c => c.id === 'radial' ? {...c, point: [x, y]} : c);
  else if(drag.control === 'rotation') {
    const corners = fresh(next);
    next.controlPoints = previous.map(c => c.id.startsWith('corner-') ? corners.find(p => p.id === c.id) : c);
  } else {
    const points = fresh(next);
    next.controlPoints = previous.map(c => c.id === drag.control || (drag.control === 'bend' || drag.control === 'end') && c.id === 'head-length' ? points.find(p => p.id === c.id) : c);
  }
  return next.controlPoints.every(c => finitePoint(c.point)) ? next : s;
}

function moveAndroidTail(s: AndroidShapeGeometry, point: NumberPair): NumberPair {
  let [x, y] = point;
  const [cx, cy] = s.center, [rx, ry] = s.radius;
  if(y > cy - ry && y < cy + ry) {
    if(x <= cx && x > cx - rx) x = cx - rx;
    // PINNED QUIRK: centerY, not centerX; the later Y limit can still exclude it.
    else if(x > cy && x < cx + rx) x = cx + rx;
  }
  if(x > cx - rx && x < cx + rx) {
    if(y <= cy && y > cy - ry) y = cy - ry;
    else if(y > cy && y < cy + ry) y = cy + ry;
  }
  return [x, y];
}

/** Explicit physical view adapter: CSS top-left -> painting top-left. No RTL mirroring.
 * CSS-to-backing DPR is supplied separately from backing-to-painting scale.
 * Cropping/rotation must be inverted by the caller before this axis-aligned adapter.
 */
export function androidShapePointFromView(point: NumberPair, origin: NumberPair, dpr: number, paintingPixelsPerBackingPixel: number): NumberPair {
  if(!finitePoint(point) || !finitePoint(origin) || !Number.isFinite(dpr) || dpr <= 0 || !Number.isFinite(paintingPixelsPerBackingPixel) || paintingPixelsPerBackingPixel <= 0) throw new RangeError('Invalid view adapter units');
  const mapped: NumberPair = [(point[0] - origin[0]) * dpr * paintingPixelsPerBackingPixel, (point[1] - origin[1]) * dpr * paintingPixelsPerBackingPixel];
  if(!finitePoint(mapped)) throw new RangeError('View adapter overflow');
  return mapped;
}
