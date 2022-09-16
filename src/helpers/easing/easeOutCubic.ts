export default function easeOutCubic(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : easeOutCubicApply(t / d, c) + b;
}

export function easeOutCubicApply(v: number, c: number) {
  return c * (--v * v * v + 1);
}
