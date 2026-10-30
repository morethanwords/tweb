import liteMode from '@helpers/liteMode';
import styles from '@components/popups/myQrCode.module.scss';

const FADE_OUT_MS = 350;

/**
 * Layers stacked in one host, the newest on top: a new one fades in over the old one, which goes once it is covered.
 * The fade is in the stylesheet (`.layer`), under the animation levels; this only moves the class. With the
 * animations off the swap is at once.
 *
 * The old layer fades out as the new one fades in, unless `keepCovered`: then it stays as it is under the new one
 * until that one is whole (an opaque backdrop would otherwise let the black under both show through for a moment).
 */
export default function createLayerStack<T extends HTMLElement = HTMLElement>(
  host: HTMLElement,
  options: {className?: string, keepCovered?: boolean} = {}
) {
  let current: T | undefined;
  const timers = new Set<number>();

  const retire = (layer: HTMLElement) => {
    if(!liteMode.isAvailable('animations')) {
      layer.remove();
      return;
    }

    if(!options.keepCovered) layer.classList.remove(styles.layerShown);
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      layer.remove();
    }, FADE_OUT_MS);
    timers.add(timer);
  };

  return {
    get current() {
      return current;
    },

    /** Puts the layer on top; `undefined` leaves the stack empty. `instant` shows it without the fade */
    set(layer: T | undefined, instant?: boolean) {
      if(current) retire(current);
      current = layer;
      if(!layer) return;

      layer.classList.add(styles.layer);
      if(options.className) layer.classList.add(options.className);
      host.append(layer);
      if(!instant && liteMode.isAvailable('animations')) {
        requestAnimationFrame(() => layer.classList.add(styles.layerShown));
      } else {
        layer.classList.add(styles.layerShown);
      }
    },

    destroy() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    }
  };
}
