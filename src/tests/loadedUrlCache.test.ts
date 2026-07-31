import {
  beginLoadedURLLoad,
  finishLoadedURLLoad,
  forgetLoadedURL,
  hasLoadedURL
} from '@helpers/dom/loadedUrlCache';

describe('loaded URL cache', () => {
  it('does not restore invalidated metadata from a late load', () => {
    const url = 'blob:loaded-cache/late';
    const load = beginLoadedURLLoad(url);

    forgetLoadedURL(url);
    finishLoadedURLLoad(load, true);

    expect(hasLoadedURL(url)).toBe(false);
  });
});
