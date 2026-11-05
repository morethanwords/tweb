// * whether saves stream to the disk through the service worker: off unless a test turns it on
const proxy = vi.hoisted(() => ({serviceMessagePort: undefined as object}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getCacheContext: () => ({downloaded: 0, type: '', url: ''}),
    get serviceMessagePort() {
      return proxy.serviceMessagePort;
    }
  }
}));

import deferredPromise from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import {ApiFileManager} from '@appManagers/apiFileManager';
import {AppDownloadManager} from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import getDownloadMediaDetails from '@appManagers/utils/download/getDownloadMediaDetails';

// * A file shown in several places (another message, shared media, another tab) shows a save of it started in one of
// * them everywhere: the other rows only join it. One that asks when the save is over already must not download the
// * file again, unasked (a stray event did, and the new download's own event set the next one off)

const doc = {
  _: 'document',
  id: '7',
  access_hash: '1',
  file_reference: new Uint8Array([1]),
  dc_id: 2,
  size: 30 * 1024 * 1024,
  mime_type: 'application/zip',
  file_name: 'archive.zip',
  attributes: []
} as any;

describe('ApiFileManager.downloadMedia onlyAttach', () => {
  function makeManager() {
    const manager = Object.create(ApiFileManager.prototype) as ApiFileManager;
    const dispatchEvent = vi.fn();
    (manager as any).downloadPromises = {};
    (manager as any).appDocsManager = {getDoc: () => doc};
    (manager as any).rootScope = {dispatchEvent};
    const download = vi.fn(() => deferredPromise<Blob>());
    manager.download = download as any;
    return {manager, download, dispatchEvent};
  }

  it('starts nothing when nothing downloads the file', async() => {
    const {manager, download, dispatchEvent} = makeManager();

    const saved = manager.downloadMedia({media: doc, downloadId: '1', onlyAttach: true});
    const plain = manager.downloadMedia({media: doc, onlyAttach: true});
    expect(download).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
    await expect(saved).rejects.toMatchObject({type: 'NO_ENTRY_FOUND'});
    await expect(plain).rejects.toMatchObject({type: 'NO_ENTRY_FOUND'});
  });

  it('joins the transfer on its way', () => {
    const {manager, download, dispatchEvent} = makeManager();
    const running = deferredPromise<Blob>();
    const {fileName} = getDownloadMediaDetails({media: doc, downloadId: '2'});
    (manager as any).downloadPromises[fileName] = running;

    expect(manager.downloadMedia({media: doc, downloadId: '1', onlyAttach: true})).toBe(running);
    expect(download).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('still starts a download asked for', () => {
    const {manager, download, dispatchEvent} = makeManager();

    manager.downloadMedia({media: doc, downloadId: '1'});
    expect(download).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith('document_downloading', doc.id);
  });
});

// * In the tab the join must never take a request that does start the file down with it when it finds nothing
describe('AppDownloadManager.attachToDownloadToDisc', () => {
  // * no service worker here: a save is a plain download of the file
  const {fileName} = getDownloadMediaDetails({media: doc});

  function makeManager(downloadMedia: (options: any) => Promise<Blob>) {
    const manager = new AppDownloadManager();
    const managers = {
      apiFileManager: {downloadMedia: vi.fn(downloadMedia), cancelDownload: vi.fn()},
      appPollsManager: {getRandomIdByUploadingFileName: async(): Promise<string> => undefined}
    };
    manager.construct(managers as any);
    return {manager, managers};
  }

  const progress = (done: number) => rootScope.dispatchEventSingle('download_progress', {fileName, done, total: 4, offset: 0});

  it('only asks the worker to join the transfer, never to start one', async() => {
    const blob = new Blob(['x']);
    const {manager, managers} = makeManager(async() => blob);

    await expect(manager.attachToDownloadToDisc(doc)).resolves.toBe(blob);
    expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledOnce();
    expect(managers.apiFileManager.downloadMedia.mock.calls[0][0]).toMatchObject({media: doc, onlyAttach: true});
  });

  it('joins a save this tab started without asking the worker', () => {
    const {manager, managers} = makeManager(() => deferredPromise<Blob>());

    const saving = manager.downloadToDisc({media: doc}, true);
    expect(manager.attachToDownloadToDisc(doc)).toBe(saving);
    expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledOnce();
  });

  it('is never what a request that starts the file waits on', async() => {
    const joinAnswer = deferredPromise<Blob>();
    const blob = new Blob(['x']);
    const {manager, managers} = makeManager((options) => options.onlyAttach ? joinAnswer : Promise.resolve(blob));

    const joining = manager.attachToDownloadToDisc(doc);
    const saving = manager.downloadToDisc({media: doc}, true);
    expect(saving).not.toBe(joining);
    expect(managers.apiFileManager.downloadMedia.mock.calls[1][0].onlyAttach).toBeUndefined();

    joinAnswer.reject(makeError('NO_ENTRY_FOUND'));
    await expect(joining).rejects.toMatchObject({type: 'NO_ENTRY_FOUND'});
    await expect(saving).resolves.toBe(blob);
  });

  it('shows the progress of the transfer it joined, and a save its own after a join that found nothing', async() => {
    const joinAnswer = deferredPromise<Blob>();
    const {manager} = makeManager((options) => options.onlyAttach ? joinAnswer : deferredPromise<Blob>());

    const joining = manager.attachToDownloadToDisc(doc);
    const saving = manager.downloadToDisc({media: doc}, true);
    const joined: number[] = [], saved: number[] = [];
    joining.addNotifyListener((details: any) => joined.push(details.done));
    saving.addNotifyListener((details: any) => saved.push(details.done));

    progress(1);
    joinAnswer.reject(makeError('NO_ENTRY_FOUND'));
    await joining.catch(() => {});
    progress(2);

    expect(joined).toEqual([1]);
    expect(saved).toEqual([1, 2]);
  });

  describe('with saves streamed through the service worker', () => {
    const {fileName: streamedFileName} = getDownloadMediaDetails({media: doc, downloadId: '1'});
    const noEntry = () => Promise.reject(makeError('NO_ENTRY_FOUND'));

    beforeEach(() => {
      proxy.serviceMessagePort = {};
    });

    afterEach(() => {
      proxy.serviceMessagePort = undefined;
    });

    it('joins the streamed save first', () => {
      const {manager, managers} = makeManager(() => deferredPromise<Blob>());

      manager.attachToDownloadToDisc(doc);
      expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledOnce();
      expect(managers.apiFileManager.downloadMedia.mock.calls[0][0]).toMatchObject({downloadId: '1', onlyAttach: true});
    });

    // * another tab's save that fell back to a plain download, a file opened rather than saved
    it('joins a plain download of the file when no save streams it, and follows that one', async() => {
      const plain = deferredPromise<Blob>();
      const blob = new Blob(['x']);
      const {manager, managers} = makeManager((options) => options.downloadId ? noEntry() : plain);

      const joining = manager.attachToDownloadToDisc(doc);
      const joined: number[] = [];
      joining.addNotifyListener((details: any) => joined.push(details.done));
      await vi.waitFor(() => expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledTimes(2));
      expect(managers.apiFileManager.downloadMedia.mock.calls[1][0]).toMatchObject({onlyAttach: true});
      expect(managers.apiFileManager.downloadMedia.mock.calls[1][0].downloadId).toBeUndefined();

      rootScope.dispatchEventSingle('download_progress', {fileName: streamedFileName, done: 1, total: 4, offset: 0});
      progress(2);
      plain.resolve(blob);
      await expect(joining).resolves.toBe(blob);
      expect(joined).toEqual([2]);
    });

    it('cancels the plain download it joined', async() => {
      const {manager, managers} = makeManager((options) => options.downloadId ? noEntry() : deferredPromise<Blob>());

      const joining = manager.attachToDownloadToDisc(doc);
      await vi.waitFor(() => expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledTimes(2));
      joining.cancel();
      await expect(joining).rejects.toMatchObject({type: 'DOWNLOAD_CANCELED'});
      expect(managers.apiFileManager.cancelDownload).toHaveBeenCalledWith(fileName);
    });

    it('starts nothing and fails when neither is on its way', async() => {
      const {manager, managers} = makeManager(noEntry);

      await expect(manager.attachToDownloadToDisc(doc)).rejects.toMatchObject({type: 'NO_ENTRY_FOUND'});
      expect(managers.apiFileManager.downloadMedia).toHaveBeenCalledTimes(2);
      for(const [options] of managers.apiFileManager.downloadMedia.mock.calls) {
        expect(options.onlyAttach).toBe(true);
      }
    });
  });

  it('cancels the transfer when the row that joined it is cancelled', async() => {
    const {manager, managers} = makeManager(() => deferredPromise<Blob>());

    const joining = manager.attachToDownloadToDisc(doc);
    joining.cancel();
    expect(() => progress(1)).not.toThrow(); // * over, while its listener goes a moment later
    await expect(joining).rejects.toMatchObject({type: 'DOWNLOAD_CANCELED'});
    expect(managers.apiFileManager.cancelDownload).toHaveBeenCalledWith(fileName);
  });
});
