import {createEffect, on, onCleanup} from 'solid-js';

export function attachClassName(element: HTMLElement, accessor: () => string) {
  createEffect(on(accessor, (value, prev) => {
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
