import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {ApiFileManager} from '@appManagers/apiFileManager';
import {setEnvironment} from '@environment/utils';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import type {Document, InputMedia, MessageMedia, Photo} from '@layer';
import '@helpers/peerIdPolyfill';

const peerId = (42 as UserId).toPeerId(false);
const inputPeer = {
  _: 'inputPeerUser' as const,
  user_id: 42,
  access_hash: '1'
};

describe('rich-message media upload', () => {
  test('keeps the required audio duration when metadata decoding falls back to zero', () => {
    setEnvironment({
      IMAGE_MIME_TYPES_SUPPORTED: new Set(),
      VIDEO_MIME_TYPES_SUPPORTED: new Set()
    } as any);
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appDocsManager: {saveDoc: (document: Document.document) => document}
    });
    const file = new File(['audio'], 'audio.flac', {type: 'audio/flac'});
    const metadata = manager.makeDocumentAndMetaForSendingFile({
      duration: 0,
      entities: [],
      file,
      isDocument: false,
      isMedia: true,
      mediaTempId: 1
    } as any);
    const attribute = metadata.attributes.find((candidate) => (
      candidate._ === 'documentAttributeAudio'
    ));

    expect(attribute).toMatchObject({
      _: 'documentAttributeAudio',
      duration: 0
    });
  });

  test.each([
    ['photo', 'messageMediaPhoto'],
    ['video', 'messageMediaDocument'],
    ['audio', 'messageMediaDocument']
  ] as const)('uploads and resolves a %s reference without sending a standalone message', async(
    type,
    mediaType
  ) => {
    const manager = new AppMessagesManager();
    const file = new File(
      ['media'],
      type === 'photo' ? 'image.jpg' : type === 'video' ? 'video.mp4' : 'audio.mp3',
      {
        type: type === 'photo' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'audio/mpeg'
      }
    );
    const inputMedia: InputMedia = type === 'photo' ? {
      _: 'inputMediaUploadedPhoto',
      pFlags: {},
      file: {_: 'inputFile', id: 1, parts: 1, name: file.name, md5_checksum: ''}
    } : {
      _: 'inputMediaUploadedDocument',
      pFlags: {},
      file: {_: 'inputFile', id: 1, parts: 1, name: file.name, md5_checksum: ''},
      mime_type: file.type,
      attributes: []
    };
    const photo = {
      _: 'photo',
      id: '101',
      access_hash: '201',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const document = {
      _: 'document',
      id: '102',
      access_hash: '202',
      file_reference: new Uint8Array([2])
    } as Document.document;
    const uploaded: MessageMedia = mediaType === 'messageMediaPhoto' ? {
      _: 'messageMediaPhoto',
      pFlags: {},
      photo
    } : {
      _: 'messageMediaDocument',
      pFlags: {},
      document
    };
    const invokeApi = vi.fn().mockResolvedValue(uploaded);
    const savePhoto = vi.fn((value) => value);
    const saveDoc = vi.fn((value) => value);

    Object.assign(manager as any, {
      mediaTempId: 1,
      uploadFilePromises: {},
      apiManager: {invokeApi},
      appPeersManager: {getInputPeerById: () => inputPeer},
      appPhotosManager: {savePhoto},
      appDocsManager: {saveDoc}
    });
    vi.spyOn(manager, 'makeDocumentAndMetaForSendingFile').mockReturnValue({
      attachType: type,
      fileType: file.type,
      apiFileName: file.name,
      attributes: [],
      actionName: type === 'photo' ?
        'sendMessageUploadPhotoAction' :
        type === 'video' ?
          'sendMessageUploadVideoAction' :
          'sendMessageUploadAudioAction'
    } as ReturnType<AppMessagesManager['makeDocumentAndMetaForSendingFile']>);
    const uploadMediaFile = vi.spyOn(manager, 'uploadMediaFile').mockResolvedValue(inputMedia);

    await expect(manager.uploadRichMessageMedia({
      peerId,
      sendFileDetails: {file, spoiler: true},
      uploadingFileName: 'rich-message-upload'
    })).resolves.toEqual(type === 'photo' ? {
      type,
      photo,
      spoiler: true
    } : type === 'video' ? {
      type,
      document,
      spoiler: true
    } : {
      type,
      document
    });

    expect(uploadMediaFile).toHaveBeenCalledWith(expect.objectContaining({
      peerId,
      file,
      uploadingFileName: 'rich-message-upload',
      spoiler: type === 'audio' ? undefined : true,
      attachType: type
    }));
    expect(invokeApi).toHaveBeenCalledWith('messages.uploadMedia', {
      peer: inputPeer,
      media: inputMedia
    });
    expect(type === 'photo' ? savePhoto : saveDoc).toHaveBeenCalledOnce();
  });

  // the composer decided it is a file block (an audio/wav is no music block): it is sent as a file,
  // not taken back for an audio by its mime type
  test('keeps a file block a file, an audio/wav too', () => {
    setEnvironment({
      IMAGE_MIME_TYPES_SUPPORTED: new Set(),
      VIDEO_MIME_TYPES_SUPPORTED: new Set()
    } as any);
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      mediaTempId: 1,
      uploadFilePromises: {},
      appDocsManager: {saveDoc: (document: Document.document) => document},
      thumbsStorage: {setCacheContextBlob: vi.fn()}
    });
    const file = new File(['wave'], 'take.wav', {type: 'audio/wav'});
    const {document} = manager.prepareRichMessageMedia({sendFileDetails: {file}, uploadingFileName: 'take', asFile: true});
    expect(document.attributes.map(({_}) => _)).toEqual(['documentAttributeFilename']);

    const uploadMediaFile = vi.spyOn(manager, 'uploadMediaFile').mockReturnValue(new Promise(() => {}));
    void manager.uploadRichMessageMedia({peerId, sendFileDetails: {file}, uploadingFileName: 'take', asFile: true});
    expect(uploadMediaFile).toHaveBeenCalledWith(expect.objectContaining({
      attachType: 'document',
      actionName: 'sendMessageUploadDocumentAction'
    }));
  });

  // the upload's ring stays until messages.uploadMedia answers; a cancel in that time finds no transfer
  // to stop, and the media must not complete as if nobody had asked
  test('a cancel once the bytes are up gives the media up instead of completing it', async() => {
    setEnvironment({
      IMAGE_MIME_TYPES_SUPPORTED: new Set(),
      VIDEO_MIME_TYPES_SUPPORTED: new Set()
    } as any);
    const manager = new AppMessagesManager();
    const uploadMedia = deferredPromise<MessageMedia>();
    const invokeApi = vi.fn(() => uploadMedia);
    const fileTransfers = {downloadPromises: {}, uploadPromises: {}, appMessagesManager: manager};
    const thumbsStorage = {
      setCacheContextBlob: vi.fn(),
      deleteCacheContext: vi.fn(),
      getCacheContext: vi.fn(() => ({url: 'blob:local'})),
      moveCacheContext: vi.fn()
    };
    Object.assign(manager as any, {
      mediaTempId: 1,
      uploadFilePromises: {},
      apiManager: {invokeApi},
      // what the ring calls: the real cancel, with no transfer left to stop
      apiFileManager: {cancelDownload: (fileName: string) => ApiFileManager.prototype.cancelDownload.call(fileTransfers, fileName)},
      appPeersManager: {getInputPeerById: () => inputPeer},
      appDocsManager: {saveDoc: (document: Document.document) => document, getDoc: () => ({type: 'audio'})},
      thumbsStorage
    });
    vi.spyOn(manager, 'uploadMediaFile').mockResolvedValue({
      _: 'inputMediaUploadedDocument',
      pFlags: {},
      file: {_: 'inputFile', id: 1, parts: 1, name: 'audio.mp3', md5_checksum: ''},
      mime_type: 'audio/mpeg',
      attributes: []
    });

    const file = new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'});
    const upload = manager.uploadRichMessageMedia({peerId, sendFileDetails: {file}, uploadingFileName: 'late'});
    upload.catch(noop);
    const shown = manager.getUploadPromise('late');
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledOnce());

    expect((manager as any).apiFileManager.cancelDownload('late')).toBe(true);
    uploadMedia.resolve({
      _: 'messageMediaDocument',
      pFlags: {},
      document: {_: 'document', id: '9', access_hash: '1', file_reference: new Uint8Array([1])} as Document.document
    });

    await expect(upload).rejects.toMatchObject({type: 'UPLOAD_CANCELED'});
    await expect(shown).rejects.toMatchObject({type: 'UPLOAD_CANCELED'});
    expect(thumbsStorage.moveCacheContext).not.toHaveBeenCalled();
  });
});
