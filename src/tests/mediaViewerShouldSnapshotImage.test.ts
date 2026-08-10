import shouldSnapshotImage, {SnapshotImageSource} from '@components/mediaViewer/shouldSnapshotImage';
import {forgetLoadedURL, markLoadedURL} from '@helpers/dom/loadedUrlCache';

const makeImage = (src: string, overrides?: Partial<SnapshotImageSource>): SnapshotImageSource => ({
  complete: true,
  currentSrc: '',
  naturalWidth: 320,
  src,
  ...overrides
});

describe('shouldSnapshotImage', () => {
  test('reuses a blob URL the worker still keeps alive', () => {
    const url = 'blob:snapshot/alive';
    markLoadedURL(url);

    expect(shouldSnapshotImage(makeImage(url))).toBe(false);
  });

  test('snapshots a decoded image whose blob URL was dropped', () => {
    const url = 'blob:snapshot/evicted';
    markLoadedURL(url);
    forgetLoadedURL(url);

    expect(shouldSnapshotImage(makeImage(url))).toBe(true);
  });

  test('reads the resolved currentSrc first', () => {
    const url = 'blob:snapshot/current';
    markLoadedURL('blob:snapshot/attribute');

    expect(shouldSnapshotImage(makeImage('blob:snapshot/attribute', {currentSrc: url}))).toBe(true);
  });

  test('reuses non-object URLs, which are never revoked', () => {
    expect(shouldSnapshotImage(makeImage('data:image/png;base64,AAAA'))).toBe(false);
    expect(shouldSnapshotImage(makeImage('https://example.com/photo.jpg'))).toBe(false);
  });

  test('keeps the URL copy when there is no bitmap to snapshot', () => {
    const url = 'blob:snapshot/pending';

    expect(shouldSnapshotImage(makeImage(url, {complete: false}))).toBe(false);
    expect(shouldSnapshotImage(makeImage(url, {naturalWidth: 0}))).toBe(false);
  });
});
