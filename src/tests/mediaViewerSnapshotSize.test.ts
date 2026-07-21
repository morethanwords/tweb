import getMediaViewerSnapshotSize from '@components/mediaViewer/snapshotSize';

describe('getMediaViewerSnapshotSize', () => {
  test('uses a capped device pixel ratio for a displayed thumbnail', () => {
    expect(getMediaViewerSnapshotSize({
      width: 320,
      height: 180,
      sourceWidth: 4000,
      sourceHeight: 2250,
      devicePixelRatio: 3
    })).toEqual({width: 640, height: 360});
  });

  test('does not upscale a small source', () => {
    expect(getMediaViewerSnapshotSize({
      width: 640,
      height: 360,
      sourceWidth: 320,
      sourceHeight: 180,
      devicePixelRatio: 2
    })).toEqual({width: 320, height: 180});
  });

  test('caps the backing canvas area', () => {
    const size = getMediaViewerSnapshotSize({
      width: 3840,
      height: 2160,
      sourceWidth: 7680,
      sourceHeight: 4320,
      devicePixelRatio: 2
    });

    expect(size.width * size.height).toBeLessThanOrEqual(1_501_000);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  });

  test('preserves source aspect ratio for an object-fit crop', () => {
    const size = getMediaViewerSnapshotSize({
      width: 320,
      height: 320,
      sourceWidth: 1920,
      sourceHeight: 1080,
      devicePixelRatio: 2
    });

    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
    expect(size.height).toBe(640);
  });
});
