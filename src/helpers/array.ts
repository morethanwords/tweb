/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* import { copy } from "./object";

export function listMergeSorted(list1: any[] = [], list2: any[] = []) {
  const result = copy(list1);

  const minId = list1.length ? list1[list1.length - 1] : 0xFFFFFFFF;
  for(let i = 0; i < list2.length; i++) {
    if(list2[i] < minId) {
      result.push(list2[i]);
    }
  }

  return result;
} */

export const accumulate = (arr: number[], initialValue: number) => arr.reduce((acc, value) => acc + value, initialValue);

export function findAndSpliceAll<T>(array: Array<T>, verify: (value: T, index: number, arr: typeof array) => boolean) {
  const out: typeof array = [];
  let idx = -1;
  while((idx = array.findIndex(verify)) !== -1) {
    out.push(array.splice(idx, 1)[0]);
  }

  return out;
}

export function forEachReverse<T>(array: Array<T>, callback: (value: T, index?: number, array?: Array<T>) => void) {
  for(let length = array.length, i = length - 1; i >= 0; --i) {
    callback(array[i], i, array);
  }
};
