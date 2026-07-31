import deferredPromise from '@helpers/cancellablePromise';
import {ApiFileManager} from '@appManagers/apiFileManager';

function makeManager({
  getCacheContext,
  setCacheContextBlob,
  download
}: {
  getCacheContext: () => {downloaded: number, type: string, url: string},
  setCacheContextBlob: (media: any, type: string, blob: Blob) => {downloaded: number, type: string, url: string},
  download: Promise<Blob>
}) {
  const manager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  (manager as any).thumbsStorage = {
    getCacheContext,
    setCacheContextBlob
  };
  manager.downloadMedia = vi.fn(() => download) as any;
  return manager;
}

describe('ApiFileManager object URLs', () => {
  it('re-reads the canonical context before concurrent downloads create a URL', async() => {
    const media = {_: 'document', id: 'concurrent'} as any;
    const blob = new Blob(['downloaded']);
    const download = deferredPromise<Blob>();
    let canonical: {downloaded: number, type: string, url: string};
    const getCacheContext = vi.fn(() => canonical || {
      downloaded: 0,
      type: '',
      url: ''
    });
    const setCacheContextBlob = vi.fn((media, type, blob: Blob) => {
      return canonical = {
        downloaded: blob.size,
        type,
        url: 'blob:test/concurrent'
      };
    });
    const manager = makeManager({
      download,
      getCacheContext,
      setCacheContextBlob
    });

    const first = manager.downloadMediaURL({media});
    const second = manager.downloadMediaURL({media});
    download.resolve(blob);

    await expect(Promise.all([first, second])).resolves.toEqual([
      'blob:test/concurrent',
      'blob:test/concurrent'
    ]);
    expect(setCacheContextBlob).toHaveBeenCalledOnce();
  });
});
