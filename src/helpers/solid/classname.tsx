import {createRenderEffect, on, onCleanup} from 'solid-js';

// a render effect: the classes are on the element before it goes into the document, so none of
// its transitions runs from the bare element as it appears (see `Passthrough`)
export function attachClassName(element: HTMLElement, accessor: () => string) {
  createRenderEffect(on(accessor, (value, prev) => {
    if(prev) {
      element.classList.remove(...prev.split(' '));
    }
    if(value) {
      element.classList.add(...value.split(' '));
    }
  }));
}

export function attachHotClassName(element: HTMLElement, ...className: string[]) {
  element.classList.add(...className);
  if(import.meta.hot) onCleanup(() => void element.classList.remove(...className));
}
