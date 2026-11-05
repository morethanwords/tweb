import {IS_POPUP_SANDBOX, IS_PREVIEW} from '@config/debug';

/*
 * A preview tab frequently isn't painting (it runs backgrounded / headless),
 * and browsers throttle — or entirely pause — `requestAnimationFrame` for such
 * tabs. The boot leans on rAF heavily: `#main-columns` is faded in from one,
 * and `fastRaf` / `doubleRaf` gate large parts of startup. A paused rAF would
 * therefore leave the page stuck blank.
 *
 * Under the preview flag a frame is asked of the browser and of a timer at
 * once, and whichever comes first runs it. A tab that paints gets the
 * browser's frames — in step with its screen and at its rate (120 Hz on a
 * 120 Hz one), so what moves looks as it will in production — and the timer
 * only stands by. One that has not painted for a while gets a frame every
 * ~16 ms from the timer, which keeps firing regardless of paint state. This
 * module is imported first by src/index.ts so the swap is in place before any
 * rAF call. Production builds fold the branch away — IS_PREVIEW is a literal
 * `false` there.
 */
if((IS_PREVIEW || IS_POPUP_SANDBOX) && typeof window !== 'undefined') {
  const FRAME_MS = 1000 / 60;
  // a tab whose last frame came longer ago than this is taken for one that does not paint
  const STALL_MS = 100;
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  const pending = new Map<number, {frame: number, timer: number}>();
  let lastFrameAt = -Infinity, lastId = 0;

  /** Takes the request out, true if it was still waiting */
  const settle = (id: number) => {
    const request = pending.get(id);
    if(!request) return false;
    pending.delete(id);
    cancelFrame(request.frame);
    window.clearTimeout(request.timer);
    return true;
  };

  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = ++lastId;
    const painting = performance.now() - lastFrameAt < STALL_MS;
    pending.set(id, {
      frame: requestFrame((now) => {
        lastFrameAt = performance.now();
        if(settle(id)) callback(now);
      }),
      timer: window.setTimeout(() => {
        if(settle(id)) callback(performance.now());
      }, painting ? STALL_MS : FRAME_MS)
    });
    return id;
  };

  window.cancelAnimationFrame = (id: number) => {
    settle(id);
  };
}
