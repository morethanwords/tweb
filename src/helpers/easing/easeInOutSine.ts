// https://spicyyoghurt.com/tools/easing-functions
export default function easeInOutSine(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : easeInOutSineApply(t / d, c) + b;
}

export function easeInOutSineApply(v: number, c: number) {
  return -c / 2 * (Math.cos(Math.PI * v) - 1);
}
