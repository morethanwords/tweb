/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * A FIFO promise queue: each enqueued operation starts only after every
 * previously enqueued one has settled. The internal tail swallows rejections —
 * one failed operation must never wedge the queue — while the promise
 * `enqueue` returns still resolves/rejects with that operation's own outcome.
 *
 * This is THE serializer for "one at a time, in order" async work (chain block
 * application, media transitions, worker RPC). Hand-rolling the tail is how a
 * copy loses its rejection handler and bricks its queue forever.
 */
export interface SerializedQueue {
  enqueue<T>(operation: () => T | Promise<T>): Promise<T>;
}

export default function createSerializedQueue(): SerializedQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
      const run = tail.then(operation);
      tail = run.then((): undefined => undefined, (): undefined => undefined);
      return run;
    }
  };
}
