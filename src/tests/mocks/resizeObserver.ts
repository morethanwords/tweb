export const resizeObserverCtorCallback = vi.fn();
export const resizeObserverInstances: ResizeObserverMock[] = [];

export class ResizeObserverMock {
  constructor(cb: ResizeObserverCallback) {
    resizeObserverCtorCallback(cb);
    this.callback = cb;
    resizeObserverInstances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  callback: ResizeObserverCallback;
}
