export default function easeOutCirc(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : easeOutCircApply(t / d, c) + b;
}

export function easeOutCircApply(v: number, c: number) {
  return c * Math.sqrt(1 - --v * v);
}
