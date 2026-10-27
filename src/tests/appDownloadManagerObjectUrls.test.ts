const mocks = vi.hoisted(() => ({
  getCacheContext: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getCacheContext: mocks.getCacheContext
  }
}));

import {AppDownloadManager} from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import makeError from '@helpers/makeError';
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

  it('lets a download still on its way go when the tab switches accounts: the next account asks anew', async() => {
    const media = makeDocument('across-switch');
    let rejectFirst: (error: unknown) => void;
    const downloadMediaURL = vi.fn()
    .mockImplementationOnce(() => new Promise((_, reject) => rejectFirst = reject))
    .mockResolvedValueOnce('stream/next');
    const manager = makeManager(downloadMediaURL);
    manager.construct((manager as any).managers);
    mocks.getCacheContext.mockReturnValue({downloaded: 0, type: '', url: ''});

    const first = manager.downloadMediaURL({media});
    rootScope.dispatchEventSingle('account_switched', {from: 1, to: 2});
    const next = manager.downloadMediaURL({media});
    expect(next).not.toBe(first);

    // * what the previous account's request brings is dropped, and does not take the new one along
    rejectFirst(makeError('MIDDLEWARE'));
    await expect(first).rejects.toMatchObject({type: 'MIDDLEWARE'});
    await expect(next).resolves.toBe('stream/next');
    expect(manager.downloadMediaURL({media})).toBe(next);
    expect(downloadMediaURL).toHaveBeenCalledTimes(2);
  });
});
