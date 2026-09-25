import {MIME_TYPE_EXTENSION_MAP} from '@environment/mimeTypeMap';
import getFileMimeType, {normalizeFileMimeType} from '@helpers/files/getFileMimeType';

describe('getFileMimeType', () => {
  test('keeps a specific MIME type', () => {
    expect(getFileMimeType(new File([], 'clipboard-video.mov', {type: 'image/png'}))).toBe('image/png');
  });

  test('normalizes the alternate QuickTime MIME type', () => {
    expect(getFileMimeType(new File([], 'clipboard-video', {type: 'video/x-quicktime'}))).toBe('video/quicktime');
  });

  test.each([
    ['clipboard-video.mov', '', 'video/quicktime'],
    ['clipboard-video.MOV', 'application/octet-stream', 'video/quicktime'],
    ['clipboard-video.mp4', '', 'video/mp4'],
    ['clipboard-video.MP4', 'application/octet-stream', 'video/mp4'],
    ['song.m4a', '', 'audio/mp4'],
    ['song.FLAC', 'application/octet-stream', 'audio/flac'],
    ['song.opus', '', 'audio/ogg'],
    ['song.oga', 'application/octet-stream', 'audio/ogg']
  ])('infers %s with generic MIME as %s', (name, type, expected) => {
    expect(getFileMimeType(new File([], name, {type}))).toBe(expected);
  });

  test('leaves an unknown generic file as a document', () => {
    expect(getFileMimeType(new File([], 'clipboard-file.bin', {type: 'application/octet-stream'})))
    .toBe('application/octet-stream');
  });

  test.each([
    ['clipboard-video.mov', '', 'video/quicktime'],
    ['clipboard-video.MOV', 'application/octet-stream', 'video/quicktime'],
    ['clipboard-video.mp4', '', 'video/mp4'],
    ['clipboard-video.MP4', 'application/octet-stream', 'video/mp4'],
    ['song.m4a', '', 'audio/mp4'],
    ['song.FLAC', 'application/octet-stream', 'audio/flac'],
    ['song.opus', '', 'audio/ogg']
  ])('writes inferred MIME to %s before sending', (name, type, expected) => {
    const file = new File(['video'], name, {type, lastModified: 123});
    const normalized = normalizeFileMimeType(file);

    expect(normalized).not.toBe(file);
    expect(normalized.type).toBe(expected);
    expect(normalized.name).toBe(name);
    expect(normalized.size).toBe(file.size);
    expect(normalized.lastModified).toBe(123);
  });

  test('keeps the original File when its MIME is already specific', () => {
    const file = new File([], 'clipboard-video.mp4', {type: 'video/mp4'});
    expect(normalizeFileMimeType(file)).toBe(file);
  });

  // * a screenshot or photo pasted in Safari arrives as HEIC, under either brand
  test.each([
    ['Screenshot.heic', 'image/heic'],
    ['Screenshot.heic', 'image/heif'],
    ['Screenshot.heic', ''],
    ['Screenshot.HEIC', 'application/octet-stream'],
    ['Screenshot.heif', ''],
    ['Screenshot', 'image/heif']
  ])('resolves a pasted %s (%s) to image/heic', (name, type) => {
    expect(getFileMimeType(new File([], name, {type}))).toBe('image/heic');
  });

  test.each([
    ['audio/mp3', 'audio/mpeg'],
    ['audio/m4a', 'audio/mp4'],
    ['audio/x-aac', 'audio/aac'],
    ['audio/x-m4a', 'audio/mp4'],
    ['audio/opus', 'audio/ogg'],
    ['audio/x-flac', 'audio/flac'],
    ['audio/x-ogg', 'audio/ogg']
  ])('normalizes the %s audio alias', (type, expected) => {
    expect(getFileMimeType(new File([], 'song', {type}))).toBe(expected);
  });
});

test('keeps Ogg video distinct from audio before upload', () => {
  const file = new File(['OggS'], 'movie.ogv', {type: 'video/ogg'});
  expect(getFileMimeType(file)).toBe('video/ogg');
  expect(normalizeFileMimeType(file)).toBe(file);
});

test.each([
  ['movie.ogv', '', 'video/ogg'],
  ['movie.ogv', 'application/octet-stream', 'video/ogg'],
  ['movie.ogv', 'application/ogg', 'video/ogg'],
  ['movie.ogv', 'application/x-ogg', 'video/ogg'],
  ['song.oga', 'application/ogg', 'audio/ogg'],
  ['song.opus', 'application/x-ogg', 'audio/ogg'],
  ['unknown', 'application/ogg', 'application/ogg']
])('resolves an Ogg container from %s/%s without inventing its media type', (name, type, expected) => {
  expect(normalizeFileMimeType(new File(['OggS'], name, {type})).type).toBe(expected);
});

describe('MIME_TYPE_EXTENSION_MAP', () => {
  test('names a HEIC file .heic rather than .heif', () => {
    expect(MIME_TYPE_EXTENSION_MAP['image/heic']).toBe('heic');
  });
});
