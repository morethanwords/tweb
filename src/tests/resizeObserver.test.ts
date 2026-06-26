import {observeResize, unobserveResize} from '@/components/resizeObserver';
import {describe, expect, it, vi, afterEach} from 'vitest';
import {resizeObserverCtorCallback, resizeObserverInstances, ResizeObserverMock} from './mocks/resizeObserver';


describe('resizeObserver', () => {
  const observerInstance = resizeObserverInstances[0];
  const observerInstanceCallback = (entries: ResizeObserverEntry[]) => {
    observerInstance.callback(entries, observerInstance);
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a ResizeObserver instance', () => {
    expect(resizeObserverCtorCallback).toHaveBeenCalled();
    expect(resizeObserverInstances).toHaveLength(1);
    expect(observerInstance).toBeInstanceOf(ResizeObserverMock);
  });

  it('should observe element and call callback on resize', () => {
    const element = document.createElement('div');
    const callback = vi.fn();

    observeResize(element, callback);

    expect(observerInstance.observe).toHaveBeenCalledWith(element);

    // Simulate a resize event
    const mockEntry = {target: element} as unknown as ResizeObserverEntry;
    observerInstanceCallback([mockEntry]);

    expect(callback).toHaveBeenCalledWith(mockEntry);
  });

  it('should support multiple callbacks on the same element', () => {
    const element = document.createElement('div');
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    observeResize(element, callback1);
    observeResize(element, callback2);

    // Should only observe once
    expect(observerInstance.observe).toHaveBeenCalledTimes(1);

    // Simulate a resize event
    const mockEntry = {target: element} as unknown as ResizeObserverEntry;
    observerInstanceCallback([mockEntry]);

    expect(callback1).toHaveBeenCalledWith(mockEntry);
    expect(callback2).toHaveBeenCalledWith(mockEntry);
  });

  it('should remove a specific callback via unsubscribe function', () => {
    const element = document.createElement('div');
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const unsubscribe1 = observeResize(element, callback1);
    observeResize(element, callback2);

    unsubscribe1();

    // Should still be observing since callback2 is still registered
    expect(observerInstance.unobserve).not.toHaveBeenCalled();

    // Simulate a resize event
    const mockEntry = {target: element} as unknown as ResizeObserverEntry;
    observerInstanceCallback([mockEntry]);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(mockEntry);
  });

  it('should unobserve element when all callbacks are removed', () => {
    const element = document.createElement('div');
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const unsubscribe1 = observeResize(element, callback1);
    const unsubscribe2 = observeResize(element, callback2);

    unsubscribe1();
    unsubscribe2();

    expect(observerInstance.unobserve).toHaveBeenCalledWith(element);
  });

  it('should handle direct unobserveResize call', () => {
    const element = document.createElement('div');
    const callback = vi.fn();

    observeResize(element, callback);
    unobserveResize(element, callback);

    expect(observerInstance.unobserve).toHaveBeenCalledWith(element);
  });

  it('should handle unobserveResize without callback parameter', () => {
    const element = document.createElement('div');

    observeResize(element, vi.fn());
    observeResize(element, vi.fn());
    observeResize(element, vi.fn());
    unobserveResize(element);

    expect(observerInstance.unobserve).toHaveBeenCalledWith(element);
  });

  it('should handle unobserveResize on element with no callbacks', () => {
    const element = document.createElement('div');

    // Should not throw
    expect(() => unobserveResize(element)).not.toThrow();
  });

  it('should call all callbacks when multiple entries are observed', () => {
    const element1 = document.createElement('div');
    const element2 = document.createElement('div');
    const callback1_1 = vi.fn();
    const callback1_2 = vi.fn();
    const callback2 = vi.fn();

    observeResize(element1, callback1_1);
    observeResize(element1, callback1_2);
    observeResize(element2, callback2);

    // Simulate multiple resize events
    const mockEntry1 = {target: element1} as unknown as ResizeObserverEntry;
    const mockEntry2 = {target: element2} as unknown as ResizeObserverEntry;
    observerInstanceCallback([mockEntry1, mockEntry2]);

    expect(callback1_1).toHaveBeenCalledWith(mockEntry1);
    expect(callback1_2).toHaveBeenCalledWith(mockEntry1);
    expect(callback2).toHaveBeenCalledWith(mockEntry2);
  });

  it('should add the same callback multiple times as separate entries', () => {
    const element = document.createElement('div');
    const callback = vi.fn();

    const unsubscribe1 = observeResize(element, callback);
    const unsubscribe2 = observeResize(element, callback);

    // Should only observe once
    expect(observerInstance.observe).toHaveBeenCalledTimes(1);

    // Simulate a resize event
    const mockEntry = {target: element} as unknown as ResizeObserverEntry;
    observerInstanceCallback([mockEntry]);

    // Callback should be called twice (once for each registration)
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, mockEntry);
    expect(callback).toHaveBeenNthCalledWith(2, mockEntry);

    // Removing one subscription should not unobserve
    unsubscribe1();
    expect(observerInstance.unobserve).not.toHaveBeenCalled();

    // Removing the second subscription should unobserve
    unsubscribe2();
    expect(observerInstance.unobserve).toHaveBeenCalledWith(element);
  });
});
