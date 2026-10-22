import {bindActiveWindowListener, getAppWindow, onAppWindowChange} from '@helpers/appWindow';

// * the slowest it goes: a bar measured before it was laid out, or one that has since grown, is not
// * left behind for long
const MAX_DELAY = 250;
// * below this a timer gives nothing over the frames themselves
const FRAME_DELAY = 34;

/**
 * Calls `update` while `media` plays, as often as what it draws has something to show: when `bar`,
 * as wide as the whole length, has a pixel to move, or the clock a second to turn. A frame loop
 * updated a track of a few minutes sixty times a second for a fraction of a pixel each time - a
 * main-thread frame every 16 ms for as long as the music played. A short voice message or a video in
 * the viewer still moves its bar every frame. The width comes from a ResizeObserver, after the
 * layout: a bar not put into the document yet, or one that grows while it plays, is followed.
 */
export default function createMediaProgressTicker(media: HTMLMediaElement, bar: HTMLElement, update: () => void) {
  let timeout: number, frame: number, scheduledIn: Window, width = 0, resizeObserver: ResizeObserver;
  let unfollow: (() => void)[] = [];

  const cancel = () => {
    scheduledIn?.clearTimeout(timeout);
    scheduledIn?.cancelAnimationFrame(frame);
    timeout = frame = scheduledIn = undefined;
  };

  const stop = () => {
    cancel();
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    unfollow.forEach((callback) => callback());
    unfollow = [];
    media.removeEventListener('seeked', tick);
    media.removeEventListener('ratechange', tick);
  };

  // * also at once when the time jumps, runs at another rate, or the bar changes its width; in the
  // * window the app is in (a Document PiP one leaves the tab behind, maybe hidden), and not while it
  // * is hidden - there is nothing to see, and it goes on once it is shown
  const tick = () => {
    cancel();
    update();
    const win = getAppWindow();
    if(media.paused || win.document.hidden) {
      return;
    }

    const rate = media.playbackRate || 1;
    const msPerPixel = media.duration * 1000 / Math.max(1, width) / rate;
    const msToSecond = (1000 - (media.currentTime * 1000) % 1000) / rate + 1;
    const delay = Math.min(Number.isFinite(msPerPixel) ? msPerPixel : MAX_DELAY, msToSecond, MAX_DELAY);
    scheduledIn = win;
    if(delay < FRAME_DELAY) {
      frame = win.requestAnimationFrame(tick);
    } else {
      timeout = win.setTimeout(tick, delay);
    }
  };

  return {
    start: () => {
      stop();
      media.addEventListener('seeked', tick);
      media.addEventListener('ratechange', tick);
      unfollow = [
        bindActiveWindowListener((win) => win.document, 'visibilitychange', tick),
        onAppWindowChange(tick)
      ];
      const RO = (getAppWindow() as Window & typeof globalThis).ResizeObserver;
      if(bar && RO) {
        resizeObserver = new RO((entries) => {
          const {width: newWidth} = entries[entries.length - 1].contentRect;
          if(newWidth !== width) {
            width = newWidth;
            tick();
          }
        });
        resizeObserver.observe(bar);
      }

      tick();
    },
    stop
  };
}
