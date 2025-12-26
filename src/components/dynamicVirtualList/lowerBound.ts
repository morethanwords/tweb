const maxIters = 100; // that's way more than enough to guard in case of weird input

export function lowerBound(
  low: number,
  high: number,
  target: number,
  getValue: (index: number) => number,
): number {
  let i = 0;

  while(low <= high) {
    const mid = low + Math.floor((high - low) / 2);

    const value = getValue(mid);

    if(target > value) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }

    if(i++ > maxIters) return 0;
  }

  return low;
}
