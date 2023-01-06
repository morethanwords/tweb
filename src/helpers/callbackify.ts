/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Awaited} from '../types';

export default function callbackify<T extends Awaited<any>, R>(
  smth: T,
  callback: (result: Awaited<T>) => R
): T extends Promise<any> ? Promise<Awaited<R>> : R {
  if(smth instanceof Promise) {
    // @ts-ignore
    return smth.then(callback);
  } else {
    return callback(smth as any) as any;
  }
}
