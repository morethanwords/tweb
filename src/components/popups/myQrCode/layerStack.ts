import liteMode from '@helpers/liteMode';

const FADE_OUT_MS = 350;

/**
 * Canvases stacked in one host, the newest on top: a new one fades in over the old one, which goes once it is covered.
 * The fade is in the stylesheet (`shownClass`), under the animation levels; this only moves the class. With the
 * animations off the swap is at once.
 */
export default function createLayerStack(host: HTMLElement, layerClass: string, shownClass: string) {
  let current: HTMLCanvasElement | undefined;
  const timers = new Set<number>();

  const retire = (canvas: HTMLCanvasElement) => {
    if(!liteMode.isAvailable('animations')) {
      canvas.remove();
      return;
    }

    canvas.classList.remove(shownClass);
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      canvas.remove();
    }, FADE_OUT_MS);
    timers.add(timer);
  };

  return {
    get current() {
      return current;
    },

    /** Puts the canvas on top; `undefined` leaves the stack empty */
    set(canvas: HTMLCanvasElement | undefined) {
      if(current) retire(current);
      current = canvas;
      if(!canvas) return;

      canvas.classList.add(layerClass);
      host.append(canvas);
      if(liteMode.isAvailable('animations')) {
        requestAnimationFrame(() => canvas.classList.add(shownClass));
      } else {
        canvas.classList.add(shownClass);
      }
    },

    destroy() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    }
  };
}
