
/**
 * Maps value from a range [min, max] to another range [tMin, tMax]
 */
export default function nMap(value: number, min: number, max: number, tMin: number, tMax: number) {
  return ((value - min) / (max - min)) * (tMax - tMin) + tMin;
}
