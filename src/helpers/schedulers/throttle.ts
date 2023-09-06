// * Jolly Cobra's schedulers

import {AnyToVoidFunction} from '../../types';

export default function throttle<F extends AnyToVoidFunction>(
  fn: F,
  ms: number,
  shouldRunFirst = true
) {
  let interval: number | null = null;
  let isPending: boolean;
  let args: Parameters<F>;

  const clear = () => {
    clearInterval(interval!);
    interval = null;
  };

  const ret = (..._args: Parameters<F>) => {
    isPending = true;
    args = _args;

    if(!interval) {
      if(shouldRunFirst) {
        isPending = false;
        // @ts-ignore
        fn(...args);
      }

      interval = setInterval(() => {
        if(!isPending) {
          clear();
          return;
        }

        isPending = false;
        // @ts-ignore
        fn(...args);
      }, ms) as any;
    }
  };

  ret.clear = clear;

  return ret;
}
