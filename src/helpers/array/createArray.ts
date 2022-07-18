export default function createArray<T1>(length: number, fill?: T1, map?: any): T1[] {
  const arr = new Array<T1>(length);
  arr.fill(fill);
  return map ? arr.map(map) : arr;
}
