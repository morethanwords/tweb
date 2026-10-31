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

  const retire = (layer: HTMLElement, coveredBy?: Animation) => {
    if(!liteMode.isAvailable('animations')) {
      layer.remove();
      return;
    }

    // a layer revealed by an animation of its own covers the old one only once it has ended
    if(coveredBy) {
      coveredBy.finished.finally(() => layer.remove());
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

    /**
     * Puts the layer on top; `undefined` leaves the stack empty. `instant` shows it without the fade; `reveal` shows it
     * by an animation of its own (the colour's wave), the old one staying under it till that has ended.
     */
    set(layer: T | undefined, how: {instant?: boolean, reveal?: (layer: T) => Animation | undefined} = {}) {
      const previous = current;
      current = layer;
      if(!layer) {
        if(previous) retire(previous);
        return;
      }

      layer.classList.add(styles.layer);
      if(options.className) layer.classList.add(options.className);
      host.append(layer);
      const revealing = previous && liteMode.isAvailable('animations') ? how.reveal?.(layer) : undefined;
      if(previous) retire(previous, revealing);
      if(!revealing && !how.instant && liteMode.isAvailable('animations')) {
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
