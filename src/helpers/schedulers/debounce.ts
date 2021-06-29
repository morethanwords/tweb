// * Jolly Cobra's schedulers

import { AnyToVoidFunction } from "../../types";

export default function debounce<F extends AnyToVoidFunction>(
  fn: F,
  ms: number,
  shouldRunFirst = true,
  shouldRunLast = true,
) {
  let waitingTimeout: number | null = null;

  return (...args: Parameters<F>) => {
    if(waitingTimeout) {
      clearTimeout(waitingTimeout);
      waitingTimeout = null;
    } else if(shouldRunFirst) {
      // @ts-ignore
      fn(...args);
    }

    waitingTimeout = setTimeout(() => {
      if(shouldRunLast) {
        // @ts-ignore
        fn(...args);
      }

      waitingTimeout = null;
    }, ms) as any;
  };
}
