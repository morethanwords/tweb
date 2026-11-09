import {createRenderEffect, on, onCleanup} from 'solid-js';

// a render effect: the classes are on the element before it goes into the document, so none of
// its transitions runs from the bare element as it appears (see `Passthrough`)
export function attachClassName(element: HTMLElement, accessor: () => string) {
  // only the tokens that changed: what else puts classes on the element keeps them
  createRenderEffect(on(accessor, (value, prev) => {
    const tokens = value ? value.split(' ').filter(Boolean) : [];
    const removed = prev ? prev.split(' ').filter((token) => token && !tokens.includes(token)) : [];
    if(removed.length) element.classList.remove(...removed);
    if(tokens.length) element.classList.add(...tokens);
  }));
}

export function attachHotClassName(element: HTMLElement, ...className: string[]) {
  element.classList.add(...className);
  if(import.meta.hot) onCleanup(() => void element.classList.remove(...className));
}
