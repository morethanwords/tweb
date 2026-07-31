const mocks = vi.hoisted(() => ({
  fixChromiumMp4: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appDocsManager: {
        fixChromiumMp4: mocks.fixChromiumMp4
      }
    }
  }
}));

import {CRBUG_1250841_ERROR} from '@helpers/fixChromiumMp4.constants';
import onMediaLoad, {shouldIgnoreVideoError} from '@helpers/onMediaLoad';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeVideo(src: string) {
  const video = document.createElement('video');
  const load = vi.fn();
  video.src = src;
  Object.defineProperties(video, {
    error: {
      configurable: true,
      value: {code: 4, message: CRBUG_1250841_ERROR}
    },
    load: {configurable: true, value: load}
  });
  return {load, video};
}

function deferRepair() {
  let resolveRepair: (url: string) => void;
  mocks.fixChromiumMp4.mockImplementation(() => new Promise<string>((resolve) => {
    resolveRepair = resolve;
  }));
  return (url: string) => resolveRepair(url);
}

describe('onMediaLoad object URL recovery', () => {
  it('repairs a Chromium MP4 blob URL in place', async() => {
    const {load, video} = makeVideo('blob:test/original');
    mocks.fixChromiumMp4.mockResolvedValue('blob:test/repaired');

    expect(shouldIgnoreVideoError({target: video} as unknown as ErrorEvent)).toBe(true);
    await vi.waitFor(() => {
      expect(video.src).toBe('blob:test/repaired');
    });

    expect(mocks.fixChromiumMp4).toHaveBeenCalledWith('blob:test/original');
    expect(load).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent errors while a repair is pending', async() => {
    const {load, video} = makeVideo('blob:test/original-concurrent');
    const resolveRepair = deferRepair();
    const firstEvent = {target: video} as unknown as ErrorEvent;

    expect(shouldIgnoreVideoError(firstEvent)).toBe(true);
    // * the same event object is remembered without re-triggering a repair
    expect(shouldIgnoreVideoError(firstEvent)).toBe(true);
    // * a distinct error for the same pending source is absorbed too
    expect(shouldIgnoreVideoError({target: video} as unknown as ErrorEvent)).toBe(true);
    expect(mocks.fixChromiumMp4).toHaveBeenCalledOnce();

    resolveRepair('blob:test/repaired-concurrent');
    await vi.waitFor(() => {
      expect(video.src).toBe('blob:test/repaired-concurrent');
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not overwrite a source that changed while the repair was pending', async() => {
    const {load, video} = makeVideo('blob:test/original-stale');
    const resolveRepair = deferRepair();

    expect(shouldIgnoreVideoError({target: video} as unknown as ErrorEvent)).toBe(true);
    video.src = 'blob:test/replacement';
    resolveRepair('blob:test/repaired-stale');
    await new Promise((resolve) => setTimeout(resolve));

    expect(video.src).toBe('blob:test/replacement');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('onMediaLoad listeners', () => {
  it('removes both listeners once the media can play', async() => {
    const video = document.createElement('video');
    const addSpy = vi.spyOn(video, 'addEventListener');
    const removeSpy = vi.spyOn(video, 'removeEventListener');

    const promise = onMediaLoad(video);
    video.dispatchEvent(new Event('canplay'));
    await expect(promise).resolves.toBeUndefined();

    expect(addSpy).toHaveBeenCalledTimes(2);
    for(const [name, handler] of addSpy.mock.calls) {
      expect(removeSpy).toHaveBeenCalledWith(name, handler);
    }
  });

  it('keeps listening after an ignored error and rejects on a real one', async() => {
    const video = document.createElement('video');
    let error: MediaError = null;
    Object.defineProperty(video, 'error', {
      configurable: true,
      get: () => error
    });
    const removeSpy = vi.spyOn(video, 'removeEventListener');

    const promise = onMediaLoad(video);
    // * error is null — ignored, the promise must stay pending and keep its listeners
    video.dispatchEvent(new Event('error'));
    expect(removeSpy).not.toHaveBeenCalled();

    error = {code: 3, message: 'decode failed'} as MediaError;
    video.dispatchEvent(new Event('error'));
    await expect(promise).rejects.toBe(error);

    expect(removeSpy).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.fixChromiumMp4).not.toHaveBeenCalled();
  });
});
