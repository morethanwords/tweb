export default function easeOutQuad(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : easeOutQuadApply(t / d, c) + b;
}

export function easeOutQuadApply(v: number, c: number) {
  return -c * v * (v - 2);
}
