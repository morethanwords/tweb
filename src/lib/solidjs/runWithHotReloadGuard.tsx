import {createRoot} from 'solid-js';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

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
