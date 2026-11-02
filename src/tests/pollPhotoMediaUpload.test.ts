import deferredPromise from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import noop from '@helpers/noop';
import withTimeout from '@helpers/schedulers/withTimeout';
import {AppPollsManager} from '@appManagers/appPollsManager';
import type {AttachedPhoto} from '@components/popups/createPoll/storeContext';

const PEER_ID = 777 as PeerId;

// a poll's photo, with the server answering messages.uploadMedia by `uploadMedia`
function uploadPhoto(uploadMedia: () => Promise<unknown>) {
  const manager = Object.create(AppPollsManager.prototype) as AppPollsManager;
  Object.assign(manager as any, {
    appMessagesManager: {
      getMediaTempId: () => 1,
      makeDocumentAndMetaForSendingFile: (): {photo: object} => ({photo: {_: 'photo', id: 'temp', sizes: []}}),
      makeMediaUploadDeferred: () => ({deferred: deferredPromise(), uploadingFileName: 'poll-photo'}),
      syncSentAndUploadPromises: noop,
      sendSmthLazyLoadQueue: {push: ({load}: {load: () => unknown}): void => void load()}
    },
    apiFileManager: {
      upload: () => Promise.resolve({_: 'inputFile', id: '1', parts: 1, name: 'photo.jpg', md5_checksum: ''})
    },
    apiManager: {invokeApi: uploadMedia},
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerSelf'})},
    appPhotosManager: {savePhoto: (photo: any) => photo}
  });

  const media: AttachedPhoto = {type: 'photo', objectUrl: 'blob:photo', blob: new Blob(['jpeg']), width: 10, height: 10};
  return (manager as any).uploadPollMedia(PEER_ID, media).deferred as Promise<unknown>;
}

// what the poll waits for: its media, settled one way or the other
function settle(promise: Promise<unknown>) {
  return withTimeout(promise.then(() => 'uploaded', (error) => error?.type ?? 'failed'), 50, 'pending');
}

describe('AppPollsManager: a poll\'s photo', () => {
  it('is ready once the server has taken it', async() => {
    const deferred = uploadPhoto(() => Promise.resolve({
      _: 'messageMediaPhoto',
      pFlags: {},
      photo: {_: 'photo', id: '5', access_hash: '6', file_reference: new Uint8Array(), pFlags: {}, sizes: [], dc_id: 2, date: 0}
    }));

    expect(await settle(deferred)).toBe('uploaded');
  });

  it('fails the poll\'s wait when the server refuses it, rather than keeping it waiting', async() => {
    const deferred = uploadPhoto(() => Promise.reject(makeError('PHOTO_INVALID_DIMENSIONS' as ErrorType)));

    expect(await settle(deferred)).toBe('PHOTO_INVALID_DIMENSIONS');
  });

  it('fails the poll\'s wait when the server answers with something other than a photo', async() => {
    const deferred = uploadPhoto(() => Promise.resolve({_: 'messageMediaEmpty'}));

    expect(await settle(deferred)).not.toBe('pending');
  });
});
