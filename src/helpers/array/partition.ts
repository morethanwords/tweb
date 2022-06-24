/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function partition<T>(arr: T[], callback: (item: T, idx: number, arr: T[]) => boolean) {
  const good: T[] = [], bad: T[] = [];
  for(let i = 0, length = arr.length; i < length; ++i) {
    const item = arr[i];
    (callback(item, i, arr) ? good : bad).push(item);
  }

  return [good, bad];
}
