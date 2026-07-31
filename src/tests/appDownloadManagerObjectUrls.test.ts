const mocks = vi.hoisted(() => ({
  getCacheContext: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getCacheContext: mocks.getCacheContext
  }
}));

import {AppDownloadManager} from '@lib/appDownloadManager';
import type {Document} from '@layer';

const makeDocument = (id: DocId) => ({
  _: 'document',
  pFlags: {},
  id,
  access_hash: '1',
  file_reference: new Uint8Array(),
  date: 0,
  mime_type: 'image/jpeg',
  size: 10,
  dc_id: 1,
  attributes: [],
  thumbs: []
}) as unknown as Document.document;

function makeManager(downloadMediaURL: (options: any) => Promise<string>) {
  const manager = new AppDownloadManager();
  (manager as any).managers = {
    apiFileManager: {
      downloadMediaURL
    }
  };
  return manager;
}

describe('AppDownloadManager object URL cache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('drops a fulfilled object URL after mirror invalidation', async() => {
    const media = makeDocument('stale-url');
    const downloadMediaURL = vi.fn()
    .mockResolvedValueOnce('blob:test/previous')
    .mockResolvedValueOnce('blob:test/recreated');
    const manager = makeManager(downloadMediaURL);
    mocks.getCacheContext.mockReturnValue({downloaded: 0, type: '', url: ''});

    const first = manager.downloadMediaURL({media});
    await expect(first).resolves.toBe('blob:test/previous');

    const recreated = manager.downloadMediaURL({media});
    expect(recreated).not.toBe(first);
    await expect(recreated).resolves.toBe('blob:test/recreated');
    expect(downloadMediaURL).toHaveBeenCalledTimes(2);
  });

  it('keeps a fulfilled non-object URL without a thumb-cache entry', async() => {
    const media = makeDocument('stream-url');
    const downloadMediaURL = vi.fn().mockResolvedValue('stream/1');
    const manager = makeManager(downloadMediaURL);
    mocks.getCacheContext.mockReturnValue({
      downloaded: 0,
      type: '',
      url: ''
    });

    const first = manager.downloadMediaURL({media});
    await expect(first).resolves.toBe('stream/1');
    const second = manager.downloadMediaURL({media});

    expect(second).toBe(first);
    expect(downloadMediaURL).toHaveBeenCalledOnce();
  });
});
