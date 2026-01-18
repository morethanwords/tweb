import {batch} from 'solid-js';
import {fastRaf} from '@helpers/schedulers';

let rafCallbacks: Array<() => void> = [];
let isRAFing = false;

export function requestRAF(callback: () => void) {
  rafCallbacks.push(callback);

  if(isRAFing) return;

  isRAFing = true;

  fastRaf(() => {
    const savedCallbacks = rafCallbacks;

    rafCallbacks = [];
    isRAFing = false;

    batch(() => {
      savedCallbacks.forEach(cb => void cb());
    });
  });
}
