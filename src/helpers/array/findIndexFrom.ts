export default function findIndexFrom<T>(
  arr: T[],
  predicate: (item: T, idx: number, arr: T[]) => boolean,
  i: number = 0
): number {
  for(let length = arr.length; i < length; ++i) {
    if(predicate(arr[i], i, arr)) {
      return i;
    }
  }
  return -1;
}
