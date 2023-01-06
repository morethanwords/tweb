/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * Jolly Cobra's animation.ts

import {fastRaf} from './schedulers';
import deferredPromise, {CancellablePromise} from './cancellablePromise';

interface AnimationInstance {
  isCancelled: boolean;
  deferred: CancellablePromise<void>
}

type AnimationInstanceKey = any;
const instances: Map<AnimationInstanceKey, AnimationInstance> = new Map();

export function createAnimationInstance(key: AnimationInstanceKey) {
  cancelAnimationByKey(key);

  const instance: AnimationInstance = {
    isCancelled: false,
    deferred: deferredPromise<void>()
  };

  instances.set(key, instance);
  instance.deferred.then(() => {
    if(getAnimationInstance(key) === instance) {
      instances.delete(key);
    }
  });

  return instance;
}

export function getAnimationInstance(key: AnimationInstanceKey) {
  return instances.get(key);
}

export function cancelAnimationByKey(key: AnimationInstanceKey) {
  const instance = getAnimationInstance(key);
  if(instance) {
    instance.isCancelled = true;
    instance.deferred.resolve();
  }
}

export function animateSingle(tick: Function, key: AnimationInstanceKey, instance?: AnimationInstance) {
  if(!instance) {
    instance = createAnimationInstance(key);
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
