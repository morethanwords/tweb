import {afterEach, beforeEach, expect, test, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  worker: false,
  dpr: 2,
  frames: [] as FrameRequestCallback[],
  resized: new Map<Element, (entry: ResizeObserverEntry) => void>(),
  listeners: new Map<string, () => void>(),
  reconnect: new Map<HTMLElement, (element: HTMLElement) => void>(),
  tint: vi.fn(),
  draw: vi.fn()
}));

vi.mock('@components/animationIntersector', () => ({default: {}}));
vi.mock('@components/bluffSpoilerController', () => ({default: {
  isWorkerSimSupported: () => mocks.worker,
  observeReconnection: (element: HTMLElement, callback: (element: HTMLElement) => void) => mocks.reconnect.set(element, callback)
}}));
vi.mock('@helpers/dom/customProperties', () => ({default: {getPropertyAsColor: (color: string) => color}}));
vi.mock('@lib/lottie/lottiePlayer', () => ({applyColorOnContext: mocks.tint}));
vi.mock('@components/messageSpoilerOverlay/drawImageFromSource', () => ({drawImageFromSource: mocks.draw}));
vi.mock('@components/resizeObserver', () => ({
  observeResize: (element: Element, callback: (entry: ResizeObserverEntry) => void) => {
    mocks.resized.set(element, callback);
    return () => mocks.resized.delete(element);
  }
}));
vi.mock('@lib/rootScope', () => ({default: {
  addEventListener: (event: string, callback: () => void) => mocks.listeners.set(event, callback),
  removeEventListener: (event: string) => mocks.listeners.delete(event)
}}));
vi.mock('@helpers/themeController', () => ({default: {isNight: () => false}}));

import DotRenderer from '@components/dotRenderer';

const cleanups: Array<() => void> = [];

beforeEach(() => {
  mocks.dpr = 2;
  mocks.frames.length = 0;
  mocks.tint.mockClear();
  mocks.draw.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => mocks.frames.push(callback));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({clearRect: vi.fn()} as any);
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.resized.clear();
  mocks.listeners.clear();
  mocks.reconnect.clear();
  document.documentElement.style.removeProperty('--secondary-text-color');
  document.body.replaceChildren();
});

function setup(worker: boolean, readyResult: MaybePromise<boolean> = true) {
  mocks.worker = worker;
  const overlayUpdate = vi.fn();
  vi.spyOn(DotRenderer, 'attachTextSpoilerOverlay').mockImplementation((options) => {
    cleanups.push(options.onDestroy);
    return {dpr: mocks.dpr, readyResult, overlay: {update: overlayUpdate}} as any;
  });
  vi.spyOn(DotRenderer, 'attachTextSpoilerTarget').mockImplementation((options) => {
    cleanups.push(options.onDestroy);
    return {dpr: mocks.dpr, readyResult, sourceCanvas: document.createElement('canvas')} as any;
  });
  const container = document.createElement('div');
  const element = document.createElement('span');
  const canvas = document.createElement('canvas');
  canvas.className = 'bluff-spoiler-canvas';
  element.append(canvas);
  container.append(element);
  document.body.append(container);
  const bounds = new DOMRect(10, 20, 100, 20);
  const elementBounds = vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(bounds);
  const canvasBounds = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(bounds);
  const rects = vi.spyOn(element, 'getClientRects').mockReturnValue({length: 1, item: () => bounds} as unknown as DOMRectList);
  const widthWrite = vi.spyOn(canvas.style, 'width', 'set');
  const heightWrite = vi.spyOn(canvas.style, 'height', 'set');
  DotRenderer.attachBluffTextSpoilerTarget(element, '#aaa');
  const clearMeasurements = () => {
    [elementBounds, canvasBounds, rects, widthWrite, heightWrite].forEach((spy) => spy.mockClear());
  };
  const expectNoMeasurements = () => {
    [elementBounds, canvasBounds, rects, widthWrite, heightWrite].forEach((spy) => expect(spy).not.toHaveBeenCalled());
  };
  return {container, element, canvas, bounds, elementBounds, overlayUpdate, clearMeasurements, expectNoMeasurements};
}

test.each([false, true])('recolors a ready inline spoiler without measuring or rewriting its geometry (worker=%s)', (worker) => {
  const host = setup(worker);
  const calls = host.overlayUpdate.mock.calls;
  const initialState = calls[calls.length - 1]?.[0];
  host.clearMeasurements();
  mocks.tint.mockClear();
  DotRenderer.setInlineSpoilersTextColor(host.container, '#fff');
  host.expectNoMeasurements();
  if(worker) {
    const state = calls[calls.length - 1][0];
    expect(state).toMatchObject({width: 200, height: 40, particleColor: '#fff'});
    expect(state.rects).toBe(initialState.rects);
  } else {
    expect(mocks.tint).toHaveBeenCalledWith(expect.anything(), '#fff', 0, 0, 202, 42);
    expect(host.canvas.width).toBe(200);
    expect(host.canvas.height).toBe(40);
  }
});

test.each([false, true])('keeps full geometry updates for resize and theme changes (worker=%s)', (worker) => {
  const host = setup(worker);
  host.clearMeasurements();
  host.bounds.width = 160;
  mocks.resized.get(host.canvas)({target: host.canvas} as unknown as ResizeObserverEntry);
  expect(host.elementBounds).toHaveBeenCalled();
  expect(host.canvas.style.width).toBe('160px');
  host.clearMeasurements();
  host.bounds.width = 180;
  mocks.listeners.get('theme_changed')();
  expect(host.elementBounds).toHaveBeenCalled();
  expect(host.canvas.style.width).toBe('180px');
});

test('takes a palette colour from its current inline declaration without computed style', () => {
  const host = setup(true);
  document.documentElement.style.setProperty('--secondary-text-color', '#123456');
  const computed = vi.spyOn(window, 'getComputedStyle');
  host.clearMeasurements();
  DotRenderer.setInlineSpoilersTextColor(host.container, 'secondary-text-color');
  host.expectNoMeasurements();
  expect(computed).not.toHaveBeenCalled();
  expect(host.overlayUpdate).toHaveBeenLastCalledWith(expect.objectContaining({particleColor: '#123456'}));

  document.documentElement.style.setProperty('--secondary-text-color', '#654321');
  mocks.listeners.get('theme_changed')();
  expect(host.overlayUpdate).toHaveBeenLastCalledWith(expect.objectContaining({particleColor: '#654321'}));
});

test.each([false, true])('remembers a color set before geometry is ready (worker=%s)', async(worker) => {
  let resolve: (ready: boolean) => void;
  const ready = new Promise<boolean>((_resolve) => resolve = _resolve);
  const host = setup(worker, ready);
  DotRenderer.setInlineSpoilersTextColor(host.container, '#fff');
  host.expectNoMeasurements();
  resolve(true);
  await ready;
  if(worker) {
    expect(host.overlayUpdate).toHaveBeenLastCalledWith(expect.objectContaining({particleColor: '#fff', width: 200}));
  } else {
    expect(mocks.tint).toHaveBeenCalledWith(expect.anything(), '#fff', 0, 0, 202, 42);
  }
});

test.each([false, true])('remeasures a reconnected target with its new DPR and remembered color (worker=%s)', (worker) => {
  const host = setup(worker);
  DotRenderer.setInlineSpoilersTextColor(host.container, '#fff');
  cleanups.shift()();
  mocks.dpr = 1;
  const canvas = host.element.querySelector('canvas');
  if(canvas !== host.canvas) {
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(host.bounds);
  }
  mocks.reconnect.get(host.element)(host.element);
  if(worker) {
    expect(host.overlayUpdate).toHaveBeenLastCalledWith(expect.objectContaining({particleColor: '#fff', width: 100}));
  } else {
    expect(canvas.width).toBe(100);
    expect(mocks.tint).toHaveBeenLastCalledWith(expect.anything(), '#fff', 0, 0, 101, 21);
  }
});
