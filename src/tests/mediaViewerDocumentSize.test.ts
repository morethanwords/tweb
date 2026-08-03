import getMediaViewerDocumentSize from '@components/mediaViewer/documentSize';
import type {MyDocument} from '@appManagers/appDocsManager';

const makeDocument = (overrides: Partial<MyDocument>): MyDocument => ({
  _: 'document',
  id: 1,
  access_hash: 1,
  file_reference: [],
  date: 0,
  mime_type: 'image/jpeg',
  size: 1,
  dc_id: 1,
  attributes: [],
  pFlags: {},
  type: 'photo',
  ...overrides
} as MyDocument);

describe('getMediaViewerDocumentSize', () => {
  test('uses the rotated document dimensions when the thumbnail exposes EXIF orientation', () => {
    const document = makeDocument({
      w: 5712,
      h: 4284,
      thumbs: [
        {_: 'photoStrippedSize', type: 'i', bytes: new Uint8Array()},
        {_: 'photoSize', type: 'm', w: 240, h: 320, size: 1}
      ]
    });

    expect(getMediaViewerDocumentSize(document)).toEqual({width: 4284, height: 5712});
  });

  test('keeps matching document and thumbnail orientation unchanged', () => {
    const document = makeDocument({
      w: 4284,
      h: 5712,
      thumbs: [{_: 'photoSize', type: 'm', w: 240, h: 320, size: 1}]
    });

    expect(getMediaViewerDocumentSize(document)).toBeUndefined();
  });

  test('ignores an unrelated thumbnail aspect ratio', () => {
    const document = makeDocument({
      w: 1920,
      h: 1080,
      thumbs: [{_: 'photoSize', type: 'm', w: 240, h: 320, size: 1}]
    });

    expect(getMediaViewerDocumentSize(document)).toBeUndefined();
  });

  test('does not change video document dimensions', () => {
    const document = makeDocument({
      type: 'video',
      w: 1920,
      h: 1080,
      thumbs: [{_: 'photoSize', type: 'm', w: 240, h: 320, size: 1}]
    });

    expect(getMediaViewerDocumentSize(document)).toBeUndefined();
  });
});
