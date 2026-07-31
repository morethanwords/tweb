import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {getEnvironment, setEnvironment} from '@environment/utils';
import type {Document} from '@layer';

const makeDocument = (id: DocId) => ({
  _: 'document',
  pFlags: {},
  id,
  access_hash: '1',
  file_reference: new Uint8Array(),
  date: 0,
  mime_type: 'video/mp4',
  size: 10,
  dc_id: 1,
  attributes: [],
  thumbs: [],
  type: 'video'
}) as unknown as Document.document;

describe('AppMessagesManager temporary media ownership', () => {
  it('pins optimistic video URLs, then moves the media and releases its poster', () => {
    const manager = new AppMessagesManager();
    const setCacheContextBlob = vi.fn();
    const moveCacheContext = vi.fn();
    const deleteCacheContext = vi.fn();
    const getDoc = vi.fn();
    Object.assign(manager as any, {
      appDocsManager: {
        getDoc,
        saveDoc: vi.fn((document) => document)
      },
      thumbsStorage: {
        deleteCacheContext,
        getCacheContext: vi.fn(() => ({url: 'blob:test/video'})),
        moveCacheContext,
        setCacheContextBlob
      }
    });

    const previousEnvironment = getEnvironment();
    setEnvironment({
      IMAGE_MIME_TYPES_SUPPORTED: new Set(),
      VIDEO_MIME_TYPES_SUPPORTED: new Set(['video/mp4'])
    } as ReturnType<typeof getEnvironment>);
    try {
      const video = new Blob(['video'], {type: 'video/mp4'});
      const poster = new Blob(['poster'], {type: 'image/jpeg'});
      const {document} = manager.makeDocumentAndMetaForSendingFile({
        file: video,
        height: 100,
        isDocument: false,
        isMedia: true,
        mediaTempId: 1,
        objectURL: 'blob:test/local-video',
        thumb: {
          blob: poster,
          size: {height: 10, width: 20},
          url: 'blob:test/local-poster'
        },
        width: 200
      } as any);
      (document as any).type = 'video';

      expect(setCacheContextBlob).toHaveBeenCalledTimes(2);
      expect(setCacheContextBlob.mock.calls).toEqual([
        [document, undefined, video, video.size, undefined, true],
        [document, 'local-thumb', poster, poster.size, undefined, true]
      ]);

      const finalDocument = makeDocument('final');
      getDoc.mockReturnValue(document);
      (manager as any).updateDocument(finalDocument, document.id);

      expect(moveCacheContext).toHaveBeenCalledWith(document, finalDocument);
      expect(deleteCacheContext).toHaveBeenCalledWith(document, 'local-thumb');
    } finally {
      setEnvironment(previousEnvironment);
    }
  });

  it('releases all temporary media nested in a poll', () => {
    const manager = new AppMessagesManager();
    const deleteCacheContext = vi.fn();
    Object.assign(manager as any, {thumbsStorage: {deleteCacheContext}});
    const photo = {_: 'photo', id: 'photo'} as any;
    const document = makeDocument('document');
    document.file_reference = undefined;
    const media = {
      _: 'messageMediaPoll',
      attached_media: {_: 'messageMediaPhoto', photo},
      poll: {
        answers: [{
          _: 'pollAnswer',
          media: {_: 'messageMediaDocument', document}
        }]
      },
      results: {}
    } as any;

    manager.releaseTemporaryMediaCache(media);

    expect(deleteCacheContext).toHaveBeenCalledWith(photo);
    expect(deleteCacheContext).toHaveBeenCalledWith(document);
    expect(deleteCacheContext).toHaveBeenCalledWith(document, 'local-thumb');
  });
});
