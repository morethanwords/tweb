/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function compareLong(str1: string, str2: string) {
  const str1Length = str1.length;
  if(str1Length !== str2.length) {
    const diff = str1Length - str2.length;
    return diff < 0 ? -1 : (diff > 0 ? 1 : 0);
  }

  const maxPartLength = 15;
  for(let i = 0; i < str1Length; i += maxPartLength) {
    const v1 = +str1.slice(i, i + maxPartLength);
    const v2 = +str2.slice(i, i + maxPartLength);
    const diff = v1 - v2;
    if(diff) {
      return diff;
    }
  }

  return 0;
}
