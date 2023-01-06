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

  return (..._args: Parameters<F>) => {
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
          clearInterval(interval!);
          interval = null;
          return;
        }

        isPending = false;
        // @ts-ignore
        fn(...args);
      }, ms) as any;
    }
  };
}
