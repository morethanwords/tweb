/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise, {CancellablePromise} from './cancellablePromise';
import {getHeavyAnimationPromise} from '../hooks/useHeavyAnimationCheck';
import {fastRaf} from './schedulers';
import {ArgumentTypes} from '../types';

type HeavyQueue<T extends HeavyQueue<any>> = {
  items: ArgumentTypes<T['process']>[],
  process: (...args: any[]) => ReturnType<T['process']>,
  context: any,
  promise?: CancellablePromise<ReturnType<T['process']>[]>
};
const heavyQueue: HeavyQueue<any>[] = [];
let processingQueue = false;

export default function addHeavyTask<T extends HeavyQueue<T>>(queue: T, method: 'push' | 'unshift' = 'push') {
  if(!queue.items.length) {
    return Promise.resolve([]) as typeof promise;
  }

  const promise = queue.promise = deferredPromise();
  heavyQueue[method](queue);
  processHeavyQueue();

  return promise;
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

function timedChunk<T extends HeavyQueue<T>>(queue: HeavyQueue<T>) {
  if(!queue.items.length) {
    queue.promise.resolve([] as any);
    return Promise.resolve([]);
  }

  const todo = queue.items.slice();
  const results: ReturnType<T['process']>[] = [];

  return new Promise<typeof results>((resolve, reject) => {
    const f = async() => {
      const start = performance.now();

      do {
        await getHeavyAnimationPromise();
        const possiblePromise = queue.process.apply(queue.context, todo.shift());
        let realResult: typeof results[0];
        // @ts-ignore
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
        // setTimeout(f, 25);
      } else {
        resolve(results);
      }
    };

    fastRaf(f);
    // setTimeout(f, 25);
  }).then(queue.promise.resolve.bind(queue.promise), queue.promise.reject.bind(queue.promise));
}
