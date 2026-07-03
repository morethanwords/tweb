import debounce from '@helpers/schedulers/debounce';
import throttle from '@helpers/schedulers/throttle';
import {NoneToVoidFunction} from '@types';
import {Accessor, createEffect, createSignal} from 'solid-js';
import track from './track';

export function createScheduled<T>(value: Accessor<T>, scheduleWith: (callback: NoneToVoidFunction) => NoneToVoidFunction) {
  const [scheduledValue, setScheduledValue] = createSignal(value());

  const scheduledSet = scheduleWith(() => setScheduledValue(() => value()));

  createEffect(() => {
    track(value);
    scheduledSet();
  });

  return scheduledValue;
}

export function createThrottled<T>(value: Accessor<T>, delayMs: number, shouldRunFirst?: boolean) {
  return createScheduled(value, (callback) => throttle(callback, delayMs, shouldRunFirst));
}

export function createDebounced<T>(value: Accessor<T>, delayMs: number, shouldRunFirst?: boolean, shouldRunLast?: boolean) {
  return createScheduled(value, (callback) => debounce(callback, delayMs, shouldRunFirst, shouldRunLast));
}
