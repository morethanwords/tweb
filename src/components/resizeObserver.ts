import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';
import {hotEffect} from '@helpers/hotModule';

type ResizeCallback = (entry: ResizeObserverEntry) => void;

// * the element's callbacks, and a weak handle to it for carrying it over to another window's observer
const resizeObserverMap: WeakMap<Element, {callbacks: ResizeCallback[], ref: WeakRef<Element>}> = new WeakMap();
const observedRefs: Set<WeakRef<Element>> = new Set();

const onResize: ResizeObserverCallback = (entries) => {
  for(const entry of entries) {
    const callbacks = resizeObserverMap.get(entry.target)?.callbacks;
    callbacks?.forEach((callback) => {
      try {
        callback(entry);
      } catch(e) {
        console.error('ResizeObserver callback error:', e);
      }
    });
  }
};

// * an observer belongs to the window it was made in and is notified in that window's rendering steps, which stall
// * while that window is hidden: the app's window (the tab, or Document PiP) gets its own
const makeResizeObserver = (win: Window) => new ((win as any).ResizeObserver ?? ResizeObserver)(onResize) as ResizeObserver;
let resizeObserver = makeResizeObserver(getAppWindow());

hotEffect(import.meta.hot, () => onAppWindowChange((win) => {
  const previous = resizeObserver;
  resizeObserver = makeResizeObserver(win);
  previous.disconnect();
  for(const ref of observedRefs) {
    const element = ref.deref();
    if(element) resizeObserver.observe(element);
    else observedRefs.delete(ref);
  }
}));

export function observeResize(element: Element, callback: ResizeCallback) {
  let item = resizeObserverMap.get(element);
  if(!item) {
    item = {callbacks: [], ref: new WeakRef(element)};
    resizeObserverMap.set(element, item);
    observedRefs.add(item.ref);
    resizeObserver.observe(element);
  }

  item.callbacks.push(callback);

  return () => {
    unobserveResize(element, callback);
  };
}

/**
 * Removes a resize observer callback for the given element.
 * If no callback is provided, all callbacks for the element are removed.
 */
export function unobserveResize(element: Element, callback?: ResizeCallback) {
  const item = resizeObserverMap.get(element);
  if(!item) return;
  const {callbacks} = item;

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
    observedRefs.delete(item.ref);
    resizeObserver.unobserve(element);
  }
}
