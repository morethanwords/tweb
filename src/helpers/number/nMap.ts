
/**
 * Maps value from a range [fromMin, fromMax] to another range [toMin, toMax]
 */
export default function nMap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
  return ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
}
