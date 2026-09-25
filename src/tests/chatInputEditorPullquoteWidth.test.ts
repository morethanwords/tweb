import fitPullquoteWidth from '@components/chat/inputEditor/pullquoteWidth';
import {observeResize} from '@components/resizeObserver';

vi.mock('@components/resizeObserver', () => ({observeResize: vi.fn()}));

describe('Pullquote width observer lifecycle', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  test('releases the parent resize subscription and cancels the pending frame on destroy', async() => {
    const disposers: Array<ReturnType<typeof vi.fn>> = [];
    const resizeCallbacks: Array<(entry: ResizeObserverEntry) => void> = [];
    vi.mocked(observeResize).mockImplementation((_element, callback) => {
      const dispose = vi.fn();
      disposers.push(dispose);
      resizeCallbacks.push(callback);
      return dispose;
    });
    const frames: FrameRequestCallback[] = [];
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const parent = document.createElement('div');
    const quote = document.createElement('div');
    parent.append(quote);
    document.body.append(parent);
    const controller = fitPullquoteWidth(quote);
    expect(request).toHaveBeenCalledOnce();
    frames[0](0);
    expect(disposers).toHaveLength(1);
    resizeCallbacks[0]({contentRect: {width: 500}} as ResizeObserverEntry);
    expect(request).toHaveBeenCalledTimes(2);
    controller.destroy();
    expect(cancel).toHaveBeenCalledWith(2);
    disposers.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    quote.textContent = 'No observer remains';
    await Promise.resolve();
    resizeCallbacks[0]({contentRect: {width: 600}} as ResizeObserverEntry);
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('batches repeated document updates into one scheduled measurement', async() => {
    vi.mocked(observeResize).mockImplementation(() => vi.fn());
    const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const quote = document.createElement('div');
    document.body.append(quote);
    const controller = fitPullquoteWidth(quote);
    controller.update();
    controller.update();
    await Promise.resolve();
    expect(request).toHaveBeenCalledOnce();
    controller.destroy();
  });
});
