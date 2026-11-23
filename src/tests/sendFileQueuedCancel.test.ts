import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import type {LazyLoadElementBase} from '@components/lazyLoadQueueBase';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {ApiFileManager} from '@appManagers/apiFileManager';

/**
 * More than ten files sent one by one wait their turn in `sendSmthLazyLoadQueue` before their upload begins. A cancel
 * of such a file (its bubble's ring) reaches `apiFileManager.cancelDownload` while there is no upload to stop yet: the
 * send has to be called off all the same, or the file is uploaded and sent once its turn comes.
 */
function makeManagers() {
  const manager = new AppMessagesManager();
  const queued: LazyLoadElementBase[] = [];
  const upload = vi.fn(() => {
    const deferred = deferredPromise<any>();
    deferred.addNotifyListener = vi.fn();
    return deferred;
  });
  const cancelPendingMessage = vi.fn(() => true);
  const log = Object.assign(() => {}, {error: vi.fn(), warn: vi.fn()});

  const fileManager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  Object.assign(fileManager as any, {
    downloadPromises: {},
    uploadPromises: {},
    appMessagesManager: manager
  });

  Object.assign(manager as any, {
    uploadFilePromises: {},
    log,
    rootScope: {dispatchEvent: vi.fn()},
    appPeersManager: {
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerSelf'})
    },
    apiFileManager: {upload},
    sendSmthLazyLoadQueue: {push: (item: LazyLoadElementBase) => queued.push(item)},
    getEphemeralSendContext: (): undefined => undefined,
    checkSendOptions: () => Promise.resolve(),
    generateOutgoingMessage: () => ({
      _: 'message',
      id: 1,
      mid: 1,
      random_id: '7',
      pFlags: {out: true, is_outgoing: true},
      promise: deferredPromise<void>()
    }),
    makeDocumentAndMetaForSendingFile: (): any => ({
      document: {_: 'document', id: '1', attributes: []},
      apiFileName: 'file.bin',
      actionName: 'sendMessageUploadDocumentAction',
      fileType: 'application/octet-stream',
      attachType: 'document',
      attributes: []
    }),
    getInputEntities: (): any[] => [],
    beforeMessageSending: vi.fn(),
    setTyping: vi.fn(),
    sendUploadAction: vi.fn(),
    cancelPendingMessage
  });

  return {manager, fileManager, queued, upload, cancelPendingMessage};
}

async function sendQueuedFile(manager: AppMessagesManager) {
  const result = await manager.sendFile({peerId: (1 as UserId).toPeerId(false), file: new Blob(['x'])});
  // * the send never left: what a rejection of it reaches is not the point here
  result.promise.catch(noop);
  (result.message.promise as Promise<void>).catch(noop);
  result.send();
  return result;
}

describe('a file send waiting its turn to upload', () => {
  it('is uploaded once its turn comes', async() => {
    const {manager, queued, upload} = makeManagers();
    await sendQueuedFile(manager);

    expect(queued).toHaveLength(1);
    expect(upload).not.toHaveBeenCalled();
    // * its upload never ends here: only its start matters
    queued[0].load();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('is called off by a cancel of its upload, and its turn uploads nothing', async() => {
    const {manager, fileManager, queued, upload, cancelPendingMessage} = makeManagers();
    const {uploadingFileName, promise} = await sendQueuedFile(manager);

    expect(fileManager.cancelDownload(uploadingFileName)).toBe(true);
    expect(cancelPendingMessage).toHaveBeenCalledWith('7');
    await expect(promise).rejects.toMatchObject({type: 'UPLOAD_CANCELED'});

    await queued[0].load();
    expect(upload).not.toHaveBeenCalled();
    // * nothing is left to cancel
    expect(fileManager.cancelDownload(uploadingFileName)).toBe(false);
  });
});
