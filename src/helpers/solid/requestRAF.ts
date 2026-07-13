import {batch} from 'solid-js';
import {fastRaf} from '@helpers/schedulers';

let rafCallbacks: Array<() => void> = [];
let isRAFing = false;

export function requestRAF(callback: () => void) {
  rafCallbacks.push(callback);

  const cleanup = () => {
    const index = rafCallbacks.indexOf(callback);
    if(index !== -1) rafCallbacks.splice(index, 1);
  };

  if(isRAFing) return cleanup;

  isRAFing = true;

  fastRaf(() => {
    const savedCallbacks = rafCallbacks;

    rafCallbacks = [];
    isRAFing = false;

    batch(() => {
      savedCallbacks.forEach(cb => void cb());
    });
  });

  return cleanup;
}
