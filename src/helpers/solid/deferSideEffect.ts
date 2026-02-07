/**
 * Schedules a side effect to run in a microtask,
 * outside of the current reactive batch/effect.
 */
export default function deferSideEffect(callback: () => void) {
  queueMicrotask(callback);
}
