import {IS_PREVIEW} from '@config/debug';

/*
 * A preview tab frequently isn't painting (it runs backgrounded / headless),
 * and browsers throttle — or entirely pause — `requestAnimationFrame` for such
 * tabs. The boot leans on rAF heavily: `#main-columns` is faded in from one,
 * and `fastRaf` / `doubleRaf` gate large parts of startup. A paused rAF would
 * therefore leave the page stuck blank.
 *
 * Under the preview flag we swap rAF for a fixed ~60fps timer, which keeps
 * firing regardless of paint state. This module is imported first by
 * src/index.ts so the swap is in place before any rAF call. Production builds
 * fold the branch away — IS_PREVIEW is a literal `false` there.
 */
if(IS_PREVIEW && typeof window !== 'undefined') {
  const FRAME_MS = 1000 / 60;

  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), FRAME_MS);
  };

  window.cancelAnimationFrame = (handle: number) => {
    window.clearTimeout(handle);
  };
}
