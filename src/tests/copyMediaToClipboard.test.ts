const mocks = vi.hoisted(() => ({
  downloadMedia: vi.fn()
}));

vi.mock('@lib/appDownloadManager', () => ({
  default: {
    downloadMedia: mocks.downloadMedia
  }
}));

vi.mock('@environment/imageMimeTypesSupport', () => ({
  default: new Set(['image/jpeg', 'image/png', 'image/bmp', 'image/webp'])
}));

import copyMediaToClipboard, {canCopyMediaToClipboard, canCopyVideoFrameToClipboard, copyVideoFrameToClipboard} from '@helpers/copyMediaToClipboard';

class ClipboardItemMock {
  public static supports = vi.fn(() => true);

  constructor(public items: Record<string, Blob | Promise<Blob>>) {}
}

describe('copyMediaToClipboard', () => {
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    write = vi.fn((items: ClipboardItemMock[]) => items[0].items['image/png']);
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {write}
    });
  });

  it('starts the clipboard write before the full-size download settles', async() => {
    let resolveDownload: (blob: Blob) => void;
    const download = new Promise<Blob>((resolve) => {
      resolveDownload = resolve;
    });
    const media = {
      _: 'document',
      id: '1',
      mime_type: 'image/png'
    } as any;
    mocks.downloadMedia.mockReturnValue(download);

    const result = copyMediaToClipboard(media);

    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0][0].items['image/png']).toBeInstanceOf(Promise);

    const blob = new Blob(['full-size'], {type: 'image/png'});
    resolveDownload(blob);
    await expect(result).resolves.toBe(blob);
  });

  it('downloads the largest photo size', async() => {
    const small = {_: 'photoSize', type: 'm', w: 320, h: 200, size: 10};
    const full = {_: 'photoSize', type: 'y', w: 1280, h: 800, size: 100};
    const media = {
      _: 'photo',
      id: '2',
      sizes: [small, full]
    } as any;
    const blob = new Blob(['full-size'], {type: 'image/png'});
    mocks.downloadMedia.mockResolvedValue(blob);

    await copyMediaToClipboard(media);

    expect(mocks.downloadMedia).toHaveBeenCalledWith({media, thumb: full});
  });

  it('rejects without escaping synchronously when starting the download throws', async() => {
    const error = new Error('download failed');
    const media = {
      _: 'document',
      id: '3',
      mime_type: 'image/png'
    } as any;
    mocks.downloadMedia.mockImplementationOnce(() => {
      throw error;
    });

    const result = copyMediaToClipboard(media);

    expect(write).toHaveBeenCalledOnce();
    await expect(result).rejects.toBe(error);
  });

  it('only offers media types that can be written as clipboard images', () => {
    expect(canCopyMediaToClipboard({
      _: 'document',
      mime_type: 'video/mp4'
    } as any)).toBe(false);

    ClipboardItemMock.supports.mockReturnValueOnce(false);
    expect(canCopyMediaToClipboard({
      _: 'document',
      mime_type: 'image/png'
    } as any)).toBe(false);
  });
});

describe('copyVideoFrameToClipboard', () => {
  let write: ReturnType<typeof vi.fn>;

  const makeVideo = (readyState: number, width = 1280, height = 720) => {
    const video = document.createElement('video');
    Object.defineProperties(video, {
      readyState: {value: readyState},
      videoWidth: {value: width},
      videoHeight: {value: height}
    });
    return video;
  };

  beforeEach(() => {
    write = vi.fn((items: ClipboardItemMock[]) => items[0].items['image/png']);
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {write}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the frame shown at the click and writes it as a PNG in the same tick', async() => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage} as any);
    const png = new Blob(['frame'], {type: 'image/png'});
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(callback) {
      callback(png);
    });
    const video = makeVideo(HTMLMediaElement.HAVE_CURRENT_DATA);

    const result = copyVideoFrameToClipboard(video);

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(toBlob.mock.calls[0][1]).toBe('image/png');
    expect(write).toHaveBeenCalledOnce();
    await expect(result).resolves.toBe(png);
  });

  it('rejects without touching the clipboard while the video has no frame', async() => {
    await expect(copyVideoFrameToClipboard(makeVideo(HTMLMediaElement.HAVE_METADATA))).rejects.toThrow();
    await expect(copyVideoFrameToClipboard(undefined)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it('takes a video or a GIF as a frame, and an image whole', () => {
    expect(canCopyVideoFrameToClipboard({_: 'document', type: 'video', mime_type: 'video/mp4'} as any)).toBe(true);
    expect(canCopyVideoFrameToClipboard({_: 'document', type: 'gif', mime_type: 'video/mp4'} as any)).toBe(true);
    expect(canCopyVideoFrameToClipboard({_: 'document', mime_type: 'video/quicktime'} as any)).toBe(true);
    expect(canCopyVideoFrameToClipboard({_: 'document', type: 'photo', mime_type: 'image/png'} as any)).toBe(false);
    expect(canCopyVideoFrameToClipboard({_: 'photo'} as any)).toBe(false);

    ClipboardItemMock.supports.mockReturnValueOnce(false);
    expect(canCopyVideoFrameToClipboard({_: 'document', type: 'video', mime_type: 'video/mp4'} as any)).toBe(false);
  });
});
