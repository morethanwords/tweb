// * Jolly Cobra's schedulers

import ctx from '../../environment/ctx';
import {AnyFunction, Awaited} from '../../types';
import noop from '../noop';

export type DebounceReturnType<F extends AnyFunction> = {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>;
  clearTimeout(): void;
  isDebounced(): boolean;
};

export default function debounce<F extends AnyFunction>(
  fn: F,
  ms: number,
  shouldRunFirst = true,
  shouldRunLast = true
): DebounceReturnType<F> {
  let waitingTimeout: number;
  let waitingPromise: Promise<Awaited<ReturnType<F>>>, resolve: (result: any) => void, reject: () => void;
  let hadNewCall = false;

  const invoke = (args: Parameters<F>) => {
    const _resolve = resolve, _reject = reject;
    try {
      const result = fn.apply(null, args);
      _resolve(result);
    } catch(err) {
      console.error('debounce error', err);
      // @ts-ignore
      _reject(err);
    }
  };

  const debounce = (...args: Parameters<F>) => {
    if(!waitingPromise) waitingPromise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));

    if(waitingTimeout) {
      clearTimeout(waitingTimeout);
      hadNewCall = true;
      reject();
      waitingPromise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
    } else if(shouldRunFirst) {
      invoke(args);
      hadNewCall = false;
    }

    const _waitingTimeout = ctx.setTimeout(() => {
      // will run if should run last or first but with new call
      if(shouldRunLast && (!shouldRunFirst || hadNewCall)) {
        invoke(args);
      }

      // if debounce was called during invoking
      if(waitingTimeout === _waitingTimeout) {
        waitingTimeout = waitingPromise = resolve = reject = undefined;
        hadNewCall = false;
      }
    }, ms);

    waitingTimeout = _waitingTimeout;
    waitingPromise.catch(noop);
    return waitingPromise;
  };

  debounce.clearTimeout = () => {
    if(waitingTimeout) {
      ctx.clearTimeout(waitingTimeout);
      reject();
      waitingTimeout = waitingPromise = resolve = reject = undefined;
      hadNewCall = false;
    }
  };

  debounce.isDebounced = () => !!waitingTimeout;

  return debounce;
}
