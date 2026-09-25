vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@environment/videoSupport', () => ({IS_MOV_SUPPORTED: false}));

import {
  canAddMultipleRichMessageMedia,
  getRichMessageMediaFileType,
  getRichMessageMediaRequiredRight,
  groupRichMessageMediaEntries,
  isRichMessageMediaMimeType,
  isVisualRichMessageMimeType,
  normalizeRichMessageMediaFile
} from '@helpers/files/richMessageMediaInsertPolicy';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

describe('rich-message media insert policy', () => {
  test('keeps replace single-file while add and normal insertion allow multiple files', () => {
    expect(canAddMultipleRichMessageMedia(false)).toBe(false);
    expect(canAddMultipleRichMessageMedia(true)).toBe(true);
    expect(canAddMultipleRichMessageMedia()).toBe(true);
  });

  test.each([
    ['image/jpeg', true],
    ['image/png', true],
    ['video/mp4', true],
    ['video/quicktime', true],
    ['audio/mpeg', false],
    ['application/pdf', false]
  ])('classifies %s as visual=%s', (mimeType, expected) => {
    expect(isVisualRichMessageMimeType(mimeType)).toBe(expected);
  });

  test.each([
    ['image/jpeg', 'photo'],
    ['image/gif', 'video'],
    ['video/mp4', 'video'],
    ['video/quicktime', 'video'],
    ['audio/mpeg', 'audio'],
    ['audio/mp3', 'audio'],
    ['audio/flac', 'audio'],
    ['audio/x-flac', 'audio'],
    ['video/ogg', undefined],
    ['audio/wav', undefined],
    ['application/pdf', undefined],
    ['text/plain', undefined]
  ] as const)('classifies %s as rich media type %s', (mimeType, expected) => {
    expect(getRichMessageMediaFileType(mimeType)).toBe(expected);
    expect(isRichMessageMediaMimeType(mimeType)).toBe(expected !== undefined);
  });

  test.each([
    ['audio/x-aac', 'track.aac', 'audio', 'send_audios'],
    ['application/ogg', 'track.oga', 'audio', 'send_audios'],
    ['application/octet-stream', 'track.opus', 'audio', 'send_audios'],
    ['image/jpeg', 'photo.jpg', 'photo', 'send_photos'],
    ['image/gif', 'animation.gif', 'video', 'send_gifs'],
    ['video/mp4', 'video.mp4', 'video', 'send_videos'],
    ['application/pdf', 'track.mp3.pdf', undefined, undefined]
  ] as const)(
    'classifies %s/%s as %s with %s permission',
    (mimeType, fileName, expectedType, expectedRight) => {
      expect(getRichMessageMediaFileType(mimeType, fileName)).toBe(expectedType);
      expect(getRichMessageMediaRequiredRight(mimeType, fileName))
      .toBe(expectedRight);
    }
  );

  test('normalizes extension-only audio before creating its preview URL', () => {
    const file = new File(['audio'], 'track.opus', {
      lastModified: 123,
      type: 'application/x-custom-audio'
    });
    const normalized = normalizeRichMessageMediaFile(file);

    expect(normalized).not.toBe(file);
    expect(normalized.name).toBe(file.name);
    expect(normalized.type).toBe('audio/ogg');
    expect(normalized.lastModified).toBe(123);

    const image = new File(['image'], 'misleading.mp3', {type: 'image/jpeg'});
    expect(normalizeRichMessageMediaFile(image)).toBe(image);
  });

  test('keeps audio standalone while preserving contiguous visual runs', () => {
    const entries = [
      {id: 1, type: 'photo' as const},
      {id: 2, type: 'video' as const},
      {id: 3, type: 'audio' as const},
      {id: 4, type: 'audio' as const},
      {id: 5, type: 'photo' as const},
      {id: 6, type: 'video' as const}
    ];

    expect(groupRichMessageMediaEntries(entries).map((group) => (
      group.map(({id}) => id)
    ))).toEqual([[1, 2], [3], [4], [5, 6]]);
  });

  test('splits contiguous visual runs at the Telegram collage limit', () => {
    const entries = Array.from({length: MESSAGES_ALBUM_MAX_SIZE * 2 + 1}, (_, index) => ({
      id: index + 1,
      type: index % 2 ? 'video' as const : 'photo' as const
    }));

    expect(groupRichMessageMediaEntries(entries).map((group) => group.length))
    .toEqual([MESSAGES_ALBUM_MAX_SIZE, MESSAGES_ALBUM_MAX_SIZE, 1]);
    expect(groupRichMessageMediaEntries(entries).flat()).toEqual(entries);
  });
});

for(const name of ['movie.ogv', 'movie.ogg', 'misleading.opus']) test(`preserves Ogg video MIME and rejects rich audio routing for ${name}`, () => {
  const file = new File(['OggS'], name, {type: 'video/ogg'});
  expect(normalizeRichMessageMediaFile(file)).toBe(file);
  expect(getRichMessageMediaFileType(file.type, file.name)).toBeUndefined();
  expect(getRichMessageMediaRequiredRight(file.type, file.name)).toBeUndefined();
});
