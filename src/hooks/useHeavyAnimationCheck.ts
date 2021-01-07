// * Jolly Cobra's useHeavyAnimationCheck.ts

//import { useEffect } from '../lib/teact/teact';
import { AnyToVoidFunction } from '../types';
import ListenerSetter from '../helpers/listenerSetter';
import { CancellablePromise, deferredPromise } from '../helpers/cancellablePromise';
import { pause } from '../helpers/schedulers';

const ANIMATION_START_EVENT = 'event-heavy-animation-start';
const ANIMATION_END_EVENT = 'event-heavy-animation-end';

let isAnimating = false;
let heavyAnimationPromise: CancellablePromise<void> = Promise.resolve();
let promisesInQueue = 0;

export const dispatchHeavyAnimationEvent = (promise: Promise<any>, timeout?: number) => {
  if(!isAnimating) {
    heavyAnimationPromise = deferredPromise<void>();
    document.dispatchEvent(new Event(ANIMATION_START_EVENT));
    isAnimating = true;
    console.log('dispatchHeavyAnimationEvent: start');
  }
  
  ++promisesInQueue;
  console.log('dispatchHeavyAnimationEvent: attach promise, length:', promisesInQueue);

  const promises = [
    timeout !== undefined ? pause(timeout) : undefined,
    promise.finally(() => {})
  ].filter(Boolean);

  const perf = performance.now();
  Promise.race(promises).then(() => {
    --promisesInQueue;
    console.log('dispatchHeavyAnimationEvent: promise end, length:', promisesInQueue, performance.now() - perf);
    if(!promisesInQueue) {
      isAnimating = false;
      promisesInQueue = 0;
      document.dispatchEvent(new Event(ANIMATION_END_EVENT));
      heavyAnimationPromise.resolve();

      console.log('dispatchHeavyAnimationEvent: end');
    }
  });

  return heavyAnimationPromise;
};

export const getHeavyAnimationPromise = () => heavyAnimationPromise;

export default (
  handleAnimationStart: AnyToVoidFunction,
  handleAnimationEnd: AnyToVoidFunction,
  listenerSetter?: ListenerSetter
) => {
  //useEffect(() => {
    if(isAnimating) {
      handleAnimationStart();
    }

    const add = listenerSetter ? listenerSetter.add.bind(listenerSetter, document) : document.addEventListener.bind(document);
    const remove = listenerSetter ? listenerSetter.removeManual.bind(listenerSetter, document) : document.removeEventListener.bind(document);
    add(ANIMATION_START_EVENT, handleAnimationStart);
    add(ANIMATION_END_EVENT, handleAnimationEnd);

    return () => {
      remove(ANIMATION_END_EVENT, handleAnimationEnd);
      remove(ANIMATION_START_EVENT, handleAnimationStart);
    };
  //}, [handleAnimationEnd, handleAnimationStart]);
};
