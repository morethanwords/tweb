import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {setEnvironment} from '@environment/utils';
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
});
