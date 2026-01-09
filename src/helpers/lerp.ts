/**
 * Linear interpolation between two values.
 */
export function lerp(min: number, max: number, progress: number) {
  return min + (max - min) * progress;
}

/**
 * Linear interpolation between two arrays of values.
 */
export function lerpArray(min: number[], max: number[], progress: number) {
  return min.map((start, index) => start + (max[index] - start) * progress);
}
