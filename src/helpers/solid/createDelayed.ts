import {createEffect, createSignal, onCleanup, untrack} from 'solid-js';

/**
 *
 * @param delay The delay in milliseconds or a function that takes the current value and returns the delay in milliseconds. The function can return a negative value to set the value immediately.
 */
export const createDelayed = <T>(value: () => T, defaultValue: T, delay: number | ((value: T) => number)) => {
  const [current, setCurrent] = createSignal<T>(defaultValue);

  let timeout: number;

  createEffect(() => {
    const val = value();

    const resolvedDelay = typeof delay === 'function' ? untrack(() => delay(val)) : delay;

    if(resolvedDelay < 0) {
      setCurrent(() => val);
      return;
    }

    timeout = self.setTimeout(() => {
      setCurrent(() => val);
    }, resolvedDelay);

    onCleanup(() => {
      self.clearTimeout(timeout);
    });
  });

  const result = () => current();

  result.set = (value: T) => {
    self.clearTimeout(timeout);
    setCurrent(() => value);
  };

  return result;
};
