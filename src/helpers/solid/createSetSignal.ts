import {createSignal} from 'solid-js';

export const createSetSignal = <T, >(initialValue = new Set<T>()) => createSignal(initialValue, {
  equals: (prev, next) => prev.size === next.size && [...prev].every(id => next.has(id))
});
