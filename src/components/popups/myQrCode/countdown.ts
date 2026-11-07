import {Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import {secondsLeft} from './link';

/**
 * Seconds left to a moment (unix seconds), counted by one timer that exists only while there is a moment. It writes a
 * signal, and the text that shows it is the only thing that changes. `onZero` runs once when it runs out.
 */
export function createCountdown(expires: Accessor<number | undefined>, onZero?: () => void): Accessor<number | undefined> {
  const [left, setLeft] = createSignal<number>();

  createEffect(() => {
    const until = expires();
    if(until === undefined) {
      setLeft(undefined);
      return;
    }

    const tick = () => {
      const seconds = secondsLeft(until);
      setLeft(seconds);
      if(seconds > 0) return;
      clearInterval(timer);
      onZero?.();
    };

    const timer = window.setInterval(tick, 250);
    tick();
    onCleanup(() => clearInterval(timer));
  });

  return left;
}
