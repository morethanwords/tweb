export default function easeOutCirc(t: number, b: number, c: number, d: number) {
  return t >= d ? b + c : c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
}
