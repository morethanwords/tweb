/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AckedResult} from '../lib/mtproto/superMessagePort';
import {Modify} from '../types';

export default async function modifyAckedResult<T>(acked: AckedResult<T>): Promise<Modify<AckedResult<T>, {result: T | Promise<T>}>> {
  return {
    cached: acked.cached,
    result: acked.cached ? await acked.result : acked.result
  };
}

export function modifyAckedPromise<T>(promise: Promise<AckedResult<T>>) {
  return promise.then(modifyAckedResult);
}
