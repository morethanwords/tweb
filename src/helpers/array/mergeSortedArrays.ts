export function mergeSortedArrays<T>(
  arrA: T[],
  arrB: T[],
  compare: (a: T, b: T) => number,
): T[] {
  const result: T[] = [];
  let i = 0,
    j = 0;

  while(i < arrA.length && j < arrB.length) {
    const a = arrA[i];
    const b = arrB[j];

    if(compare(a, b) === 0) {
      result.push(b);
      i++;
      j++;
    } else if(compare(a, b) < 0) {
      result.push(a);
      i++;
    } else {
      result.push(b);
      j++;
    }
  }

  // Drain any leftovers
  while(i < arrA.length) result.push(arrA[i++]);
  while(j < arrB.length) result.push(arrB[j++]);

  return result;
}
