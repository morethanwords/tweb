import BezierEasing from '@vendor/bezierEasing';
import {smoothStep} from '@components/popups/myQrCode/fieldNodes';

/**
 * The curves of the screen's motion as Android has them (`QrShareView.setReveal`, `QrShareActivity`, `stepSheet`), and
 * the keyframes that carry a curve no CSS easing has: sampled, linear between.
 */

/** The island growing into the sheet and back: a quick start and a long soft settle, no bounce */
export const SHEET_EASING = 'cubic-bezier(.16, 1, .3, 1)';
export const sheetEase = BezierEasing(0.16, 1, 0.3, 1);
export const SHEET_OPEN_MS = 420, SHEET_CLOSE_MS = 360;

/** The screen's open: 860 ms of one value that the controls follow */
export const OPEN_MS = 860;

/** The open's spring at `t` seconds: iOS's "smooth"-like, response 0.62 s, damping 0.9 (the code's build runs on it too) */
export function revealSpring(t: number) {
  const z = 0.9, w0 = 2 * Math.PI / 0.62, wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + z / Math.sqrt(1 - z * z) * Math.sin(wd * t));
}

/** The open's value at `v` (0 to 1 of its time): the spring over 0.86 s, blended into exactly 1 over the last 15% of the time, so its end has no step */
export function revealOpening(v: number) {
  if(v >= 1) return 1;
  const spring = revealSpring(v * 0.86);
  return spring + (1 - spring) * smoothStep(0.85, 1, v);
}

/** Keyframes for `frame(u)` with `u` from 0 to 1 over the animation */
export function sampledKeyframes(frame: (u: number) => Keyframe, steps = 30): Keyframe[] {
  const keyframes: Keyframe[] = [];
  for(let i = 0; i <= steps; ++i) {
    keyframes.push({...frame(i / steps), offset: i / steps});
  }

  return keyframes;
}
