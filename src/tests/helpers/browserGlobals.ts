/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Stubs the browser APIs jsdom lacks and the message rendering graph touches on import (the
 * animation intersector's observer, the workers, media queries, CSS.supports, the canvas
 * probes). Call it before importing that graph, e.g. wrapRichText.
 */
export function stubBrowserGlobals() {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class WorkerMock {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    start() {}
    terminate() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.stubGlobal('Worker', WorkerMock);
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('CSS', {supports: () => false, escape: (value: string) => value});
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}
