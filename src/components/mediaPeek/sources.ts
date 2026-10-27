import type {MediaPeekSource} from '@components/mediaPeek';

/**
 * Media that has no message of its own to be looked up in — the photos and videos of an Instant View
 * page, as a rich message shows it — says here what a peek on it shows. A module of its own, so that
 * the page does not pull in the peek and everything the peek draws with.
 */
const sources: WeakMap<Element, () => MediaPeekSource> = new WeakMap();

export function registerMediaPeekSource(element: HTMLElement, getSource: () => MediaPeekSource) {
  sources.set(element, getSource);
}

// * the element at or around `target` that has said what it shows
export function findRegisteredMediaPeekElement(target: HTMLElement) {
  for(let element = target; element; element = element.parentElement) {
    if(sources.has(element)) {
      return element;
    }
  }
}

export function getRegisteredMediaPeekSource(element: HTMLElement) {
  return sources.get(element)?.();
}
