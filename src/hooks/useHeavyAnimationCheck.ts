// * Jolly Cobra's useHeavyAnimationCheck.ts

//import { useEffect } from '../lib/teact/teact';
import { AnyToVoidFunction } from '../types';
import ListenerSetter from '../helpers/listenerSetter';
import { CancellablePromise, deferredPromise } from '../helpers/cancellablePromise';
import { pause } from '../helpers/schedulers';
import rootScope from '../lib/rootScope';
import { DEBUG } from '../lib/mtproto/mtproto_config';

const ANIMATION_START_EVENT = 'event-heavy-animation-start';
const ANIMATION_END_EVENT = 'event-heavy-animation-end';

let isAnimating = false;
let heavyAnimationPromise: CancellablePromise<void> = Promise.resolve();
let promisesInQueue = 0;

const log = console.log.bind(console.log, '[HEAVY-ANIMATION]:');

export const dispatchHeavyAnimationEvent = (promise: Promise<any>, timeout?: number) => {
  if(!isAnimating) {
    heavyAnimationPromise = deferredPromise<void>();
    rootScope.broadcast(ANIMATION_START_EVENT);
    isAnimating = true;
    DEBUG && log('start');
  }
  
  ++promisesInQueue;
  DEBUG && log('attach promise, length:', promisesInQueue, timeout);

  const promises = [
    timeout !== undefined ? pause(timeout) : undefined,
    promise.finally(() => {})
  ].filter(Boolean);

  const perf = performance.now();
  Promise.race(promises).then(() => {
    --promisesInQueue;
    DEBUG && log('promise end, length:', promisesInQueue, performance.now() - perf);
    if(!promisesInQueue) {
      isAnimating = false;
      promisesInQueue = 0;
      rootScope.broadcast(ANIMATION_END_EVENT);
      heavyAnimationPromise.resolve();

      DEBUG && log('end');
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

    const add = listenerSetter ? listenerSetter.add.bind(listenerSetter, rootScope) : rootScope.addEventListener.bind(rootScope);
    const remove = listenerSetter ? listenerSetter.removeManual.bind(listenerSetter, rootScope) : rootScope.removeEventListener.bind(rootScope);
    add(ANIMATION_START_EVENT, handleAnimationStart);
    add(ANIMATION_END_EVENT, handleAnimationEnd);

    return () => {
      remove(ANIMATION_END_EVENT, handleAnimationEnd);
      remove(ANIMATION_START_EVENT, handleAnimationStart);
    };
  //}, [handleAnimationEnd, handleAnimationStart]);
};
