import {observeResize} from '@components/resizeObserver';
import {createEffect, onCleanup} from 'solid-js';
import type {ChatInputStateContext} from '.';


export function useInputMessageContainerHeight({instance, store, setStore}: ChatInputStateContext) {
  createEffect(() => {
    if(!store.inputMessageContainerInited) return;

    const unobserve = observeResize(instance.inputMessageContainer, (entry) => {
      setStore({inputMessageContainerHeight: entry.contentRect.height});
    });

    onCleanup(() => unobserve());
  });
}
