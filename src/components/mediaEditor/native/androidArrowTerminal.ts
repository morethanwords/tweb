import BezierEasing from '@vendor/bezierEasing';
import type {AndroidPreparedCommand, AndroidSamplePreparationV1} from '@components/mediaEditor/native/androidSamplePreparation';

export type AndroidArrowScheduler = {
  now: () => number;
  request: (callback: VoidFunction) => number;
  cancel: (handle: number) => void;
};

const easeOutQuint = BezierEasing(.23, 1, .32, 1);
export const androidArrowBrowserScheduler: AndroidArrowScheduler = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle)
};

/** Input.java:315–348. Only owns time/cancellation; Input owns both wings.
 * Browser frame delivery and the shared Bezier solver are not native raster
 * parity. Persist the stamps actually emitted, never regenerate on export.
 * Reduced/off motion is unsupported by the caller, not a different stamp clock.
 */
export function createAndroidArrowTerminal(scheduler = androidArrowBrowserScheduler) {
  let generation = 0;
  let pending = false;
  let handle: number;
  const cancel = () => {
    ++generation;
    pending = false;
    if(handle !== undefined) scheduler.cancel(handle);
    handle = undefined;
  };
  return {
    pending: () => pending,
    cancel,
    start(input: AndroidSamplePreparationV1, emit: (command: AndroidPreparedCommand) => void,
      valid: () => boolean, failed: VoidFunction, presented: VoidFunction) {
      cancel();
      pending = true;
      const token = generation;
      const start = scheduler.now();
      let lastFraction = 0;
      const frame = () => {
        if(!pending || generation !== token) return;
        handle = undefined;
        if(!valid()) { cancel(); failed(); return; }
        try {
          const elapsed = scheduler.now() - start;
          if(!Number.isFinite(elapsed)) throw new Error('Invalid Arrow animation clock');
          const fraction = Math.max(lastFraction, Math.min(1, Math.max(0, elapsed / 240)));
          lastFraction = fraction;
          input.advanceArrow(easeOutQuint(fraction), emit);
          if(fraction === 1) {
            input.finishArrow(emit);
            pending = false;
          }
          presented();
          if(pending && token === generation) handle = scheduler.request(frame);
        } catch{ cancel(); failed(); }
      };
      // UP never commits, even if an injected clock starts beyond the deadline.
      handle = scheduler.request(frame);
    }
  };
}
