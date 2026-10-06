vi.mock('@lib/apiManagerProxy', () => ({
  default: {}
}));

import {AppDownloadManager} from '@lib/appDownloadManager';

describe('AppDownloadManager upload deferred', () => {
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandledRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection);
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  it('hands a failed upload to the caller alone, with nothing left unhandled', async() => {
    const manager = new AppDownloadManager();
    const error = {type: 'WALLPAPER_DIMENSIONS_INVALID'};
    const deferred = manager.getNewDeferredForUpload('wallpaper.jpg', Promise.reject(error));

    await expect(deferred).rejects.toBe(error);
    await settle();

    expect(unhandled).toEqual([]);
    expect(manager.getDownload('wallpaper.jpg')).toBeUndefined();
  });

  it('forgets a finished upload', async() => {
    const manager = new AppDownloadManager();
    const deferred = manager.getNewDeferredForUpload('photo.jpg', Promise.resolve('done'));

    await expect(deferred).resolves.toBe('done');
    await settle();

    expect(manager.getDownload('photo.jpg')).toBeUndefined();
  });
});
