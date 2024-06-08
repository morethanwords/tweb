const resizeObserverMap: WeakMap<Element, (entry: ResizeObserverEntry) => void> = new WeakMap();
const resizeObserver = new ResizeObserver((entries) => {
  for(const entry of entries) {
    const callback = resizeObserverMap.get(entry.target);
    callback(entry);
  }
});

export function observeResize(element: Element, callback: (entry: ResizeObserverEntry) => void) {
  resizeObserverMap.set(element, callback);
  resizeObserver.observe(element);

  return () => {
    unobserveResize(element);
  };
}

export function unobserveResize(element: Element) {
  resizeObserverMap.delete(element);
  resizeObserver.unobserve(element);
}
