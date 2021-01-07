// * Jolly Cobra's animation.ts

import { fastRaf } from './schedulers';
import { CancellablePromise, deferredPromise } from './cancellablePromise';

interface AnimationInstance {
  isCancelled: boolean;
  deferred: CancellablePromise<void>
}

type AnimationInstanceKey = any;
const instances: Map<AnimationInstanceKey, AnimationInstance> = new Map();

export function getAnimationInstance(key: AnimationInstanceKey) {
  return instances.get(key);
}

export function cancelAnimationByKey(key: AnimationInstanceKey) {
  const instance = getAnimationInstance(key);
  if(instance) {
    instance.isCancelled = true;
    instance.deferred.resolve();
    instances.delete(key);
  }
}

export function animateSingle(tick: Function, key: AnimationInstanceKey, instance?: AnimationInstance) {
  if(!instance) {
    cancelAnimationByKey(key);
    instance = { isCancelled: false, deferred: deferredPromise<void>() };
    instances.set(key, instance);
  }

  fastRaf(() => {
    if(instance.isCancelled) {
      return;
    }
    
    if(tick()) {
      animateSingle(tick, key, instance);
    } else {
      instance.deferred.resolve();
    }
  });

  return instance.deferred;
}

export function animate(tick: Function) {
  fastRaf(() => {
    if(tick()) {
      animate(tick);
    }
  });
}
