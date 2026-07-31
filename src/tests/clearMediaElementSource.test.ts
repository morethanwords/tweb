const mocks = vi.hoisted(() => ({
  invokeVoid: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    serviceMessagePort: {
      invokeVoid: mocks.invokeVoid
    }
  }
}));

vi.mock('@lib/accounts/getCurrentAccount', () => ({
  getCurrentAccount: () => 2
}));

vi.mock('@lib/hls/initVideoHls', () => ({
  initVideoHls: vi.fn()
}));

import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import createVideo from '@helpers/dom/createVideo';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clearMediaElementSource', () => {
  it('removes the src attribute from images without touching media APIs', () => {
    const image = new Image();
    image.src = 'blob:test/image';

    clearMediaElementSource(image);

    expect(image.hasAttribute('src')).toBe(false);
  });

  it('pauses, uses the video src setter and clears srcObject', () => {
    const video = createVideo({});
    const pause = vi.fn();
    const load = vi.fn();
    const stream = {} as MediaStream;
    Object.defineProperties(video, {
      pause: {
        configurable: true,
        value: pause
      },
      load: {
        configurable: true,
        value: load
      },
      srcObject: {
        configurable: true,
        writable: true,
        value: stream
      }
    });

    video.src = 'stream/test';
    clearMediaElementSource(video);

    expect(mocks.invokeVoid).toHaveBeenNthCalledWith(1, 'toggleStreamInUse', {
      url: 'stream/test',
      inUse: true,
      accountNumber: 2
    });
    expect(mocks.invokeVoid).toHaveBeenNthCalledWith(2, 'toggleStreamInUse', {
      url: 'stream/test',
      inUse: false,
      accountNumber: 2
    });
    expect(video.src).toBe('');
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.srcObject).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });
});
