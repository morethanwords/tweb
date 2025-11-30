import {batch} from 'solid-js';
import {animate} from '../animation';

let rafCallbacks: Array<() => void> = [];
let isRAFing = false;

export function requestRAF(callback: () => void) {
  rafCallbacks.push(callback);

  if(isRAFing) return;

  isRAFing = true;

  animate(() => {
    const savedCallbacks = rafCallbacks;

    rafCallbacks = [];
    isRAFing = false;

    batch(() => {
      savedCallbacks.forEach(cb => void cb());
    });
  });
}
