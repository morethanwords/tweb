import ctx from '@environment/ctx';
import noop from '@helpers/noop';

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachTimeout(callback: () => any, getNextTimeout: () => number, runFirst = true) {
  const cancel = () => {
    clearTimeout(timeout);
  };

  // replace callback to run noop and restore after
  const _callback = callback;
  if(!runFirst) {
    callback = noop;
  }

  let timeout: number;
  (function run() {
    callback();
    timeout = ctx.setTimeout(run, Math.max(0, getNextTimeout()));
  })();

  callback = _callback;

  return cancel;
}
