// * Jolly Cobra's useHeavyAnimationCheck.ts

//import { useEffect } from '../lib/teact/teact';
import { AnyToVoidFunction } from '../types';
import ListenerSetter from '../helpers/listenerSetter';
import { CancellablePromise, deferredPromise } from '../helpers/cancellablePromise';

const ANIMATION_START_EVENT = 'event-heavy-animation-start';
const ANIMATION_END_EVENT = 'event-heavy-animation-end';

let isAnimating = false;
let heavyAnimationPromise: CancellablePromise<void> = Promise.resolve();
let lastAnimationPromise: Promise<any>;

export const dispatchHeavyAnimationEvent = (promise: Promise<any>) => {
  if(!isAnimating) {
    heavyAnimationPromise = deferredPromise<void>();
  }

  document.dispatchEvent(new Event(ANIMATION_START_EVENT));
  isAnimating = true;
  lastAnimationPromise = promise;

  promise.then(() => {
    if(lastAnimationPromise !== promise) {
      return;
    }

    isAnimating = false;
    document.dispatchEvent(new Event(ANIMATION_END_EVENT));
    heavyAnimationPromise.resolve();
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
