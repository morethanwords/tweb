export default function asyncThrottle<Callback extends(...args: any[]) => Promise<void>>(
  callback: Callback,
  timeoutMs: number
  // shouldRunFirst = false // TO BE IMPLEMENTED:) but default to false
) {
  type Args = Parameters<Callback>;

  let lastArgs: Args;
  let timeoutId: number;
  let wasCalledWhileRunning = false;

  function runAfterTimeout() {
    timeoutId = self.setTimeout(() => {
      wasCalledWhileRunning = false; // reset before executing callback

      callback(...lastArgs)?.then(() => {
        timeoutId = undefined;
        if(wasCalledWhileRunning) runAfterTimeout();
      });
    }, timeoutMs);
  }

  const result = (...args: Args) => {
    lastArgs = args;
    wasCalledWhileRunning = true;

    if(timeoutId) return;

    runAfterTimeout();
  };

  result.clear = () => {
    self.clearTimeout(timeoutId);
    lastArgs = undefined;
    timeoutId = undefined;
    wasCalledWhileRunning = false;
  };

  return result;
}
