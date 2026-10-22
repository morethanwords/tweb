import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

/**
 * An IntersectionObserver of the viewport that follows the app: the viewport an observer looks at is
 * the one of the realm that made it, and the whole app moves into a Document PiP window and back
 * (`@helpers/appWindow`), so on every move it is made anew there and given everything observed.
 * Made at the first `observe`; where there is no IntersectionObserver (jsdom) nothing is observed.
 */
export default function createAppWindowIntersectionObserver(callback: IntersectionObserverCallback) {
  const observed: Set<Element> = new Set();
  let observer: IntersectionObserver, stopFollowing: () => void;

  const create = () => {
    const IO = (getAppWindow() as Window & typeof globalThis).IntersectionObserver;
    observer = new IO(callback);
  };

  return {
    observe(element: Element) {
      if(typeof(IntersectionObserver) === 'undefined') {
        return;
      }

      if(!observer) {
        create();
        stopFollowing = onAppWindowChange(() => {
          observer.disconnect();
          create();
          observed.forEach((element) => observer.observe(element));
        });
      }

      observed.add(element);
      observer.observe(element);
    },

    unobserve(element: Element) {
      observed.delete(element);
      observer?.unobserve(element);
    },

    disconnect() {
      observed.clear();
      observer?.disconnect();
      stopFollowing?.();
      observer = stopFollowing = undefined;
    }
  };
}
