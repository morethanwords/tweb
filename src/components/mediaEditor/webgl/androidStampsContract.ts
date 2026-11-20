import clamp from '@helpers/number/clamp';
import {lerp} from '@helpers/lerp';

/** Telegram-Android 21f7d109, Paint/Brush.java and RenderView.java:208–210.
 * Native weights are raw preferences, NOT CSS widths or stamp diameters.
 * No legacy preference conversion is implied by these helpers.
 */
export const androidStampSource = '21f7d109da6ab3506c9e9577f98c6a38771ab335';
const radialParameters = {spacing: .15, intensity: .85, scale: 1, overrideAlpha: 1, defaultWeight: .25, min: .05, max: 1, texture: 'radial'} as const;
const removalParameters = {spacing: .15, intensity: 1, scale: 1, overrideAlpha: 1, defaultWeight: 1, min: .4, max: 1.75, texture: 'radial'} as const;
export const androidBrushParameters = {
  pen: radialParameters,
  arrow: radialParameters,
  marker: {spacing: .04, intensity: .3, scale: 1.5, overrideAlpha: .45, defaultWeight: .5, min: .05, max: 1, texture: 'elliptical'},
  neon: {spacing: .07, intensity: .7, scale: 1.45, overrideAlpha: 1, defaultWeight: .5, min: .05, max: 1, texture: 'neon'},
  blur: removalParameters,
  eraser: removalParameters
} as const;

export type AndroidBrush = keyof typeof androidBrushParameters;
export type AndroidStampTool = 'pen' | 'arrow' | 'marker' | 'neon';
export type AndroidStamp = {x: number; y: number; radius: number; angle: number; intensity: number};
export type AndroidStampBounds = {x: number; y: number; width: number; height: number};

/** Presence AND version are required for future activation; absence stays legacy.
 * Coordinates use native painting pixels, origin bottom-left, angles in radians.
 * Stamp radii already include pressure/brush scale/viewport compensation.
 */
export type AndroidStampDescriptor = {
  version: 1;
  tool: AndroidStampTool;
  normalizedWeight: number;
  paintingSize: readonly [number, number];
  viewportScaleAtCapture: number;
  color: readonly [number, number, number, number]; // Straight RGBA bytes, not ARGB.
};

function finite(value: number) {
  if(!Number.isFinite(value)) throw new RangeError('Expected a finite native brush value');
  return value;
}

export function androidWeightFromProgress(tool: AndroidBrush, progress: number) {
  const {min, max} = androidBrushParameters[tool];
  return lerp(min, max, clamp(finite(progress), 0, 1));
}

export function androidWeightProgress(tool: AndroidBrush, weight: number) {
  const {min, max} = androidBrushParameters[tool];
  return clamp((finite(weight) - min) / (max - min), 0, 1);
}

export function androidBaseWeight(paintingWidth: number, normalizedWeight: number) {
  if(finite(paintingWidth) <= 0) throw new RangeError('Painting width must be positive');
  finite(normalizedWeight);
  // Preserve Java float operation order, rather than silently using doubles.
  const f = Math.fround;
  return f(f(f(8 / 2048) * f(paintingWidth)) + f(f(f(90 / 2048) * f(paintingWidth)) * f(normalizedWeight)));
}

/** Render.java:92: a tap deliberately ignores point.z. */
export function androidTapRadius(baseWeight: number, tool: AndroidBrush, viewportScale: number) {
  if(finite(baseWeight) < 0 || finite(viewportScale) <= 0) throw new RangeError('Invalid native stamp scale');
  return Math.fround(Math.fround(Math.fround(baseWeight) * Math.fround(androidBrushParameters[tool].scale)) / Math.fround(viewportScale));
}

/** Render.java:52; accepts already calculated baseWeight from the sample owner. */
export function androidMovingRadius(baseWeight: number, tool: AndroidBrush, viewportScale: number, pressure: number) {
  if(finite(baseWeight) < 0 || finite(pressure) < 0 || finite(viewportScale) <= 0) throw new RangeError('Invalid native pressure or scale');
  // Point.z is Java double: the entire expression is promoted before its final
  // cast to float, unlike the tap's all-float expression.
  return Math.fround(Math.fround(baseWeight) * pressure * Math.fround(androidBrushParameters[tool].scale) / Math.fround(viewportScale));
}

export function androidCompositeAlpha(tool: AndroidStampTool, selectedAlphaByte: number) {
  if(!Number.isInteger(selectedAlphaByte) || selectedAlphaByte < 0 || selectedAlphaByte > 255) throw new RangeError('Expected an alpha byte');
  return Math.trunc(Math.fround(selectedAlphaByte * Math.fround(androidBrushParameters[tool].overrideAlpha))) / 255;
}
