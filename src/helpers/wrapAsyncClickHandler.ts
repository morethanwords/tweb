/**
 * Prevent spamming an async click handler
 */
export function wrapAsyncClickHandler<Args extends any[]>(handler: (...args: Args) => Promise<void>) {
  let isPending = false;
  return async(...args: Args) => {
    if(isPending) return;

    try {
      isPending = true;
      await handler(...args);
    } finally {
      isPending = false;
    }
  };
}
