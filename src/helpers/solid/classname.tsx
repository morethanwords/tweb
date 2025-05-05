import {createEffect, on} from 'solid-js';

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
