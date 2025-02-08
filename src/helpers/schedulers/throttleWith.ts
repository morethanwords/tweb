// * Jolly Cobra's schedulers

import {AnyToVoidFunction} from '../../types';

export default function throttleWith<F extends AnyToVoidFunction>(
  schedulerFn: AnyToVoidFunction,
  fn: F,
  shouldRunFirst = false
) {
  let isPending: boolean;
  let waiting: number;
  let args: Parameters<F>;

  const ret = (..._args: Parameters<F>) => {
    isPending = true;
    args = _args;

    if(waiting) {
      return;
    }

    if(shouldRunFirst) {
      isPending = false;
      // @ts-ignore
      fn(...args);
    }

    const _waiting = waiting = Math.random();
    schedulerFn(() => {
      if(waiting !== _waiting) {
        return;
      }

      ret.clear();
      if(!isPending) {
        return;
      }

      isPending = false;
      // @ts-ignore
      fn(...args);
    });
  };

  ret.clear = () => {
    waiting = undefined;
  };

  return ret;
}
