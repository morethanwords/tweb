import {createRoot} from 'solid-js';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

/**
 * If your function creates and returns computations (e.g. signals, effects, etc.), make sure it is wrapped in a `createRoot` call.
 */
export function runWithHotReloadGuard<T>(fn: () => T): T {
  let result: T;

  const dispose = createRoot((dispose) => {
    (
      <SolidJSHotReloadGuardProvider>
        {void (result = fn())}
      </SolidJSHotReloadGuardProvider>
    );

    return dispose;
  });

  dispose();

  return result;
}
