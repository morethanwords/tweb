const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn(),
  registry: undefined as any
}));

vi.mock('@lib/mainWorker/objectUrlRegistry', async(importOriginal) => {
  const actual: any = await importOriginal();
  mocks.registry = new actual.ObjectUrlRegistry({createObjectURL: mocks.createObjectURL, revokeObjectURL: vi.fn()}, 0);
  return {...actual, default: mocks.registry};
});

vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {getInstance: () => ({invokeVoid: vi.fn()})}
}));

import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppDocsManager} from '@appManagers/appDocsManager';
import {resetSharedObjectURLCaches} from '@lib/mainWorker/sharedObjectUrlCache';
import ThumbsStorage from '@lib/storages/thumbs';
import {setEnvironment} from '@environment/utils';
import type {Document, InputMedia, MessageMedia} from '@layer';

// What the composer uploads is a file at hand, as a sent message's is: the media the server makes of
// it is already there, so nothing downloads it back, and an audio plays from it.

beforeEach(() => {
  let nextUrl = 0;
  mocks.createObjectURL.mockImplementation(() => `blob:test/local-${++nextUrl}`);
  setEnvironment({IMAGE_MIME_TYPES_SUPPORTED: new Set(), VIDEO_MIME_TYPES_SUPPORTED: new Set()} as any);
});

afterEach(() => {
  resetSharedObjectURLCaches();
  mocks.registry.dispose();
});

test('the uploaded audio is the local file: the server\'s document comes downloaded from it', async() => {
  const manager = new AppMessagesManager();
  const thumbsStorage = new ThumbsStorage();
  (thumbsStorage as any).accountNumber = 1;
  // the stores saveDoc keeps, without the rest of what the manager sets up in a worker
  const docs = new AppDocsManager();
  Object.assign(docs, {docs: {}, altDocsByMainMediaDocument: {}, thumbsStorage, referencesStorage: {saveContext: vi.fn()}});
  const file = new File([new Uint8Array(1234)], 'track.mp3', {type: 'audio/mpeg'});
  const serverDocument = {
    _: 'document', pFlags: {}, id: '9001', access_hash: '1', file_reference: [1], date: 0, dc_id: 2,
    size: file.size, mime_type: 'audio/mpeg', attributes: [{_: 'documentAttributeAudio', pFlags: {}, duration: 3}]
  } as Document.document;
  const uploaded: MessageMedia = {_: 'messageMediaDocument', pFlags: {}, document: serverDocument};
  const inputMedia: InputMedia = {
    _: 'inputMediaUploadedDocument', pFlags: {}, mime_type: file.type, attributes: [],
    file: {_: 'inputFile', id: 1, parts: 1, name: file.name, md5_checksum: ''}
  };
  Object.assign(manager as any, {
    mediaTempId: 1,
    uploadFilePromises: {},
    thumbsStorage,
    apiManager: {invokeApi: vi.fn().mockResolvedValue(uploaded)},
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerSelf'})},
    appDocsManager: docs
  });
  vi.spyOn(manager, 'uploadMediaFile').mockResolvedValue(inputMedia);

  const result = await manager.uploadRichMessageMedia({
    peerId: (42 as UserId).toPeerId(false),
    sendFileDetails: {file, duration: 3},
    uploadingFileName: 'rich-upload'
  });

  expect(result).toMatchObject({type: 'audio', document: {id: '9001'}});
  expect(thumbsStorage.getCacheContext(serverDocument)).toMatchObject({
    url: expect.stringMatching(/^blob:test\/local-/),
    downloaded: file.size
  });
});
