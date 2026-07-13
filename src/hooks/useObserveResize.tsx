import {observeResize} from '@components/resizeObserver';
import {Accessor, createEffect, onCleanup} from 'solid-js';

export function useObserveResize(el: Accessor<HTMLElement>, callback: (entry: ResizeObserverEntry) => void) {
  createEffect(() => {
    const element = el();
    if(!element) return;
    const unobserve = observeResize(element, callback);
    onCleanup(() => void unobserve());
  });
}
