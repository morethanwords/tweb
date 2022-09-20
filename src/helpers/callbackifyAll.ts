/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Awaited} from '../types';

export default function callbackifyAll<T extends readonly unknown[] | [], R extends any>(
  values: T,
  callback: (result: { -readonly [P in keyof T]: Awaited<T[P]> }) => R
): Promise<Awaited<R>> | R {
  if(values.some((value) => value instanceof Promise)) {
    return Promise.all(values).then(callback as any);
  } else {
    return callback(values as any);
  }
}
