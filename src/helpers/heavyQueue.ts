/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise, { CancellablePromise } from "./cancellablePromise";
import { getHeavyAnimationPromise } from "../hooks/useHeavyAnimationCheck";
import { fastRaf } from "./schedulers";

type HeavyQueue<T> = {
  items: any[], 
  process: (...args: any[]) => T,
  context: any,
  promise?: CancellablePromise<ReturnType<HeavyQueue<T>['process']>[]>
};
const heavyQueue: HeavyQueue<any>[] = [];
let processingQueue = false;

export default function addHeavyTask<T>(queue: HeavyQueue<T>, method: 'push' | 'unshift' = 'push') {
  if(!queue.items.length) {
    return Promise.resolve([]);
  }
  
  queue.promise = deferredPromise<T[]>();
  heavyQueue[method](queue);
  processHeavyQueue();

  return queue.promise;
}

function processHeavyQueue() {
  if(!processingQueue) {
    const queue = heavyQueue.shift();
    timedChunk(queue).finally(() => {
      processingQueue = false;
      if(heavyQueue.length) {
        processHeavyQueue();
      }
    });
  }
}

function timedChunk<T>(queue: HeavyQueue<T>) {
  if(!queue.items.length) {
    queue.promise.resolve([]);
    return Promise.resolve([]);
  }

  const todo = queue.items.slice();
  const results: T[] = [];

  return new Promise<T[]>((resolve, reject) => {
    const f = async() => {
      const start = performance.now();

      do {
        await getHeavyAnimationPromise();
        const possiblePromise = queue.process.apply(queue.context, todo.shift());
        let realResult: T;
        if(possiblePromise instanceof Promise) {
          try {
            realResult = await possiblePromise;
          } catch(err) {
            reject(err);
            return;
          }
        } else {
          realResult = possiblePromise;
        }

        results.push(realResult);
      } while(todo.length > 0 && (performance.now() - start) < 6);

      if(todo.length > 0) {
        fastRaf(f);
        //setTimeout(f, 25);
      } else {
        resolve(results);
      }
    };

    fastRaf(f);
    //setTimeout(f, 25);
  }).then(queue.promise.resolve, queue.promise.reject);
}