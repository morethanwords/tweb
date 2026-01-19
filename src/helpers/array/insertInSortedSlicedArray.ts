import lastItem from '@helpers/array/lastItem';
import {mergeSortedArrays} from '@helpers/array/mergeSortedArrays';


export function insertInSortedSlicedArray<T>(slice: T[], slices: T[][], compare: (a: T, b: T) => number) {
  let i = 0;

  if(!slice.length) return;

  for(; i < slices.length; i++) {
    const currentSlice = slices[i];

    if(compareRangeSlices(slice, currentSlice, compare) < 0) {
      // the new slice is before the current one
      break;
    }

    let j = i;
    // collect all ranges that overlap with the new slice
    while(j < slices.length && compareRangeSlices(slice, slices[j], compare) === 0) {
      j++;
    }

    // the new slice is somewhere after this one, move on
    if(i === j) continue;

    let mergedArray: T[] = [...slice];

    for(let k = i; k < j; k++) {
      mergedArray = mergeSortedArrays(
        mergedArray,
        slices[k],
        compare
      );
    }

    slices.splice(i, j - i, mergedArray);
    return;
  }

  // adds at the end if didn't find a good position
  slices.splice(i, 0, slice);
}

function compareRangeSlices<T>(a: T[], b: T[], compare: (a: T, b: T) => number) {
  if(!a.length || !b.length) return 0;

  const aFirst = a[0], aLast = lastItem(a), bFirst = b[0], bLast = lastItem(b);

  if(compare(aLast, bFirst) < 0) return -1; // a is before b
  else if(compare(bLast, aFirst) < 0) return 1; // b is before a
  else return 0; // ranges overlap
}
