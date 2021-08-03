// * Jolly Cobra's schedulers

import { AnyFunction, Awaited } from "../../types";

export default function debounce<F extends AnyFunction>(
  fn: F,
  ms: number,
  shouldRunFirst = true,
  shouldRunLast = true,
) {
  let waitingTimeout: number;
  let waitingPromise: Promise<Awaited<ReturnType<F>>>, resolve: (result: any) => void, reject: () => void;
  let hadNewCall = false;

  return (...args: Parameters<F>): typeof waitingPromise => {
    if(!waitingPromise) waitingPromise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));

    if(waitingTimeout) {
      clearTimeout(waitingTimeout);
      hadNewCall = true;
      reject();
      waitingPromise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
    } else if(shouldRunFirst) {
      // @ts-ignore
      resolve(fn(...args));
      hadNewCall = false;
    }

    waitingTimeout = setTimeout(() => {
      // will run if should run last or first but with new call
      if(shouldRunLast && (!shouldRunFirst || hadNewCall)) {
        // @ts-ignore
        resolve(fn(...args));
      }

      waitingTimeout = waitingPromise = resolve = reject = undefined;
      hadNewCall = false;
    }, ms) as any;

    waitingPromise.catch(() => {});
    return waitingPromise;
  };
}
