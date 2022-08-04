// * Jolly Cobra's schedulers

import {AnyToVoidFunction} from '../../types';

export default function throttleWith<F extends AnyToVoidFunction>(schedulerFn: AnyToVoidFunction, fn: F) {
  let waiting = false;
  let args: Parameters<F>;

  return (..._args: Parameters<F>) => {
    args = _args;

    if(!waiting) {
      waiting = true;

      schedulerFn(() => {
        waiting = false;
        // @ts-ignore
        fn(...args);
      });
    }
  };
}
