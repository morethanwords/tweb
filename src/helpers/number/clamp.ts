export default function clamp(v: number, min: number, max: number): number {
  return v < min ? min : ((v > max) ? max : v);
}
