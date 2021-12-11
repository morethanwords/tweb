/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function splitStringByLimitWithRest(str: string, separator: string, limit: number) {
  const splitted = str.split(separator);
  const out: string[] = [];

  while(limit > 0 && splitted.length) {
    out.push(splitted.shift());
    --limit;
  }

  if(splitted.length) {
    out.push(splitted.join(separator));
  }

  return out;
}
