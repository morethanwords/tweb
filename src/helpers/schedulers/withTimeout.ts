/**
 * Bounds a promise that may never settle, resolving with `fallback` once `ms` has elapsed.
 *
 * Rejections still propagate — this guards only against an answer that never arrives at all
 * (a worker that stops replying, a request that never completes). Such a promise is invisible
 * to `.catch()`, so without a deadline it parks every `await` behind it for the tab's lifetime.
 */
export default function withTimeout<T, F = undefined>(
  promise: PromiseLike<T>,
  ms: number,
  fallback?: F
): Promise<T | F> {
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<F>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), ms);
  });

  // drop the timer as soon as the promise wins — callers on a render hot path would otherwise
  // leave one pending timeout, holding its closure, behind every single call
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timeout)),
    deadline
  ]);
}
