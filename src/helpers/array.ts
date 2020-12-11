import { copy } from "./object";

export function listMergeSorted(list1: any[] = [], list2: any[] = []) {
  const result = copy(list1);

  const minId = list1.length ? list1[list1.length - 1] : 0xFFFFFFFF;
  for(let i = 0; i < list2.length; i++) {
    if(list2[i] < minId) {
      result.push(list2[i]);
    }
  }

  return result;
}

export const accumulate = (arr: number[], initialValue: number) => arr.reduce((acc, value) => acc + value, initialValue);