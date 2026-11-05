import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {getMiddleware} from '@helpers/middleware';
import deferredPromise from '@helpers/cancellablePromise';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/*
 * A file shown in more than one place (another message, shared media, another tab) shows a save of it started in one
 * of them everywhere. The other rows used to be clicked by script for that, which started a download of the file
 * whenever none was on its way any more - with the automatic download of files off, and over and over, as each new
 * download's own news clicked the rows again. A row that shows a download started elsewhere only joins it.
 */

vi.mock('@components/wrappers/photo', () => ({default: async() => ({images: {}})}));
vi.mock('@lib/apiManagerProxy', () => import('@/tests/mocks/stubModule'));

let wrapDocument: typeof import('@components/wrappers/document').default;
let rootScope: typeof import('@lib/rootScope').default;
const downloadMedia = vi.fn((_options: any) => deferredPromise<Blob>());

beforeAll(async() => {
  stubBrowserGlobals();
  wrapDocument = (await import('@components/wrappers/document')).default;
  rootScope = (await import('@lib/rootScope')).default;
  const appDownloadManager = (await import('@lib/appDownloadManager')).default;
  appDownloadManager.construct({apiFileManager: {downloadMedia, cancelDownload: vi.fn()}} as any);
  registerHotReloadGuard({appImManager: {} as any});
});

async function renderRow(id: string, options: {isDownloading?: boolean, autoDownloadSize?: number} = {}) {
  const doc = {_: 'document', id, file_name: 'archive.zip', mime_type: 'application/zip', size: 30 * 1024 * 1024};
  const element = await wrapDocument({
    message: {_: 'message', mid: 1, peerId: 1, date: 0, pFlags: {}, media: {_: 'messageMediaDocument', document: doc}} as any,
    middleware: getMiddleware().get(),
    cacheContext: {downloaded: 0, url: '', type: 'full'} as any,
    autoDownloadSize: options.autoDownloadSize,
    managers: {apiFileManager: {isDownloading: async() => !!options.isDownloading}} as any
  });
  document.body.append(element);
  return element;
}

describe('a file row showing a download started elsewhere', () => {
  afterEach(() => {
    document.body.replaceChildren();
    downloadMedia.mockClear();
  });

  test('joins the download it hears of and starts none', async() => {
    await renderRow('11');
    expect(downloadMedia).not.toHaveBeenCalled();

    rootScope.dispatchEventSingle('document_downloading', '11');
    expect(downloadMedia).toHaveBeenCalledOnce();
    expect(downloadMedia.mock.calls[0][0]).toMatchObject({onlyAttach: true});
  });

  test('drawn while the file is being saved, joins that save and starts none', async() => {
    const element = await renderRow('12', {isDownloading: true});
    expect(downloadMedia).toHaveBeenCalledOnce();
    expect(downloadMedia.mock.calls[0][0]).toMatchObject({onlyAttach: true});
    expect(element.classList.contains('downloading')).toBe(true);
  });

  test('still downloads the file by itself when the automatic download of files takes it', async() => {
    await renderRow('13', {autoDownloadSize: Infinity});
    expect(downloadMedia).toHaveBeenCalledOnce();
    expect(downloadMedia.mock.calls[0][0].onlyAttach).toBeUndefined();
  });
});
