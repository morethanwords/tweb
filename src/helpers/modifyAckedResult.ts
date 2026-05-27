import {AckedResult} from '@lib/superMessagePort';
import {Modify} from '@types';

export default async function modifyAckedResult<T>(acked: AckedResult<T>): Promise<Modify<AckedResult<T>, {result: T | Promise<T>}>> {
  return {
    cached: acked.cached,
    result: acked.cached ? await acked.result : acked.result
  };
}

export function modifyAckedPromise<T>(promise: Promise<AckedResult<T>>) {
  return promise.then(modifyAckedResult);
}
