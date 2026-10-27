import snapshotRenderedMedia from '@components/mediaViewer/snapshotRenderedMedia';

// * no 2D context here, so the snapshot hands back the element it would have copied: which one it picked
const makeContainer = (...children: HTMLElement[]) => {
  const container = document.createElement('div');
  container.append(...children);
  return container;
};

const makePoster = () => {
  const image = document.createElement('img');
  image.className = 'media-photo';
  image.src = 'https://example.com/poster.jpg';
  return image;
};

const makeVideo = (readyState: number) => {
  const video = document.createElement('video');
  video.className = 'media-video';
  Object.defineProperty(video, 'readyState', {value: readyState});
  return video;
};

describe('snapshotRenderedMedia', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('takes the frame a playing video shows over its poster, even with the poster after it', () => {
    const video = makeVideo(HTMLMediaElement.HAVE_CURRENT_DATA);
    const container = makeContainer(video, makePoster());

    expect(snapshotRenderedMedia(container, {width: 100, height: 100})).toBe(video);
  });

  test('takes the poster while the video has no frame yet', () => {
    const poster = makePoster();
    const container = makeContainer(makeVideo(HTMLMediaElement.HAVE_METADATA), poster);

    expect(snapshotRenderedMedia(container, {width: 100, height: 100})).toBe(poster);
  });

  test('takes the last drawn element when there is no video', () => {
    const poster = makePoster();
    const container = makeContainer(document.createElement('img'), poster);

    expect(snapshotRenderedMedia(container, {width: 100, height: 100})).toBe(poster);
  });
});
