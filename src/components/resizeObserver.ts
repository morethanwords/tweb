const resizeObserverMap: WeakMap<Element, Array<(entry: ResizeObserverEntry) => void>> = new WeakMap();
const resizeObserver = new ResizeObserver((entries) => {
  for(const entry of entries) {
    const callbacks = resizeObserverMap.get(entry.target);
    callbacks?.forEach((callback) => {
      try {
        callback(entry);
      } catch(e) {
        console.error('ResizeObserver callback error:', e);
      }
    });
  }
});

export function observeResize(element: Element, callback: (entry: ResizeObserverEntry) => void) {
  const callbacks = resizeObserverMap.get(element) ?? [];

  callbacks.push(callback);

  resizeObserverMap.set(element, callbacks);

  if(callbacks.length === 1) {
    resizeObserver.observe(element);
  }

  return () => {
    unobserveResize(element, callback);
  };
}

/**
 * Removes a resize observer callback for the given element.
 * If no callback is provided, all callbacks for the element are removed.
 */
export function unobserveResize(element: Element, callback?: (entry: ResizeObserverEntry) => void) {
  const callbacks = resizeObserverMap.get(element);
  if(!callbacks) return;

  if(callback) {
    const index = callbacks.indexOf(callback);
    if(index > -1) {
      callbacks.splice(index, 1);
    }
  } else {
    callbacks.splice(0, callbacks.length);
  }

  if(callbacks.length === 0) {
    resizeObserverMap.delete(element);
    resizeObserver.unobserve(element);
  }
}
