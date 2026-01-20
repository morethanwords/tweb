import {createSignal, onCleanup} from 'solid-js';
import tsNow from '@helpers/tsNow';

export function createCurrentTime(options: {
  fn?: () => number
  updateInterval?: number
  updateWrapper?: (fn: VoidFunction) => void
} = {}) {
  const {fn = tsNow, updateInterval = 30000, updateWrapper} = options;

  const [time, setTime] = createSignal(fn());
  const tick = updateWrapper ? () => {
    updateWrapper(() => setTime(fn()));
  } : () => {
    setTime(fn());
  }
  const interval = setInterval(tick, updateInterval);

  onCleanup(() => clearInterval(interval));

  return time;
}
