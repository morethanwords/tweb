// https://spicyyoghurt.com/tools/easing-functions
export default function easeOutExpo(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : easeOutExpoApply(t / d, c) + b;
}

export function easeOutExpoApply(v: number, c: number) {
  return c * (-Math.pow(2, -10 * v) + 1);
}
