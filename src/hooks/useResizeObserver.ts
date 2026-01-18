import {onCleanup} from 'solid-js';
import {requestRAF} from '@helpers/solid/requestRAF';


type ResizeCallbackArgs = {
  entry: ResizeObserverEntry;
  size: {
    width: number;
    height: number;
  };
};

type ResizeCallback = (args: ResizeCallbackArgs) => void;

export function useResizeObserver() {
  const callbacks = new Map<Element, ResizeCallback>();
  const queuedCallbacks = new Map<Element, () => void>();

  const observer = new ResizeObserver(entries => {
    for(const entry of entries) {
      if(!queuedCallbacks.has(entry.target))
        requestRAF(() => {
          const cb = queuedCallbacks.get(entry.target);
          queuedCallbacks.delete(entry.target);
          cb?.();
        });

      queuedCallbacks.set(entry.target, () => {
        const cb = callbacks.get(entry.target);
        const boxSize = entry.borderBoxSize[0];
        if(cb && boxSize) {
          cb({
            entry,
            size: {width: boxSize.inlineSize, height: boxSize.blockSize}
          });
        }
      });
    }
  });

  onCleanup(() => {
    observer.disconnect();
    callbacks.clear();
    queuedCallbacks.clear();
  });

  return (el: Element, cb: ResizeCallback) => {
    callbacks.set(el, cb);
    observer.observe(el);

    onCleanup(() => {
      callbacks.delete(el);
      observer.unobserve(el);
    });
  };
}
