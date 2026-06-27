import {DEBUG} from '@config/debug';

// makeError is called on hot paths — MIDDLEWARE / CANCELED / DOWNLOAD_CANCELED are
// created, caught and discarded by the thousand during media rendering and fast
// scrolling, and nobody ever reads their `.stack`. Capturing one is not free:
// `new Error()` eagerly walks the call stack (the dominant cost), and reading
// `.stack` then formats those frames into a string (expensive again, far more so
// in dev where it resolves source maps).
//
// So only pay for it when something can actually consume it: outside debug there
// is no stack at all (the logs buffer is debug-gated too), and inside debug the
// frames are captured eagerly — at the real throw site — but formatted lazily, the
// first time `.stack` is read (logging, serialization across the worker boundary).
// `?debug=1` flips DEBUG on, so production stacks are one query param away.
export default function makeError(type: ErrorType, message?: string): ApiError {
  const error = {type} as ApiError;
  if(message) {
    error.message = message;
  }

  if(DEBUG) {
    const realError = new Error();
    Object.defineProperty(error, 'stack', {
      configurable: true,
      enumerable: true,
      get() {
        const stack = realError.stack;
        Object.defineProperty(error, 'stack', {value: stack, writable: true, configurable: true, enumerable: true});
        return stack;
      }
    });
  }

  return error;
}
