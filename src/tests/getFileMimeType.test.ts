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
    ['clipboard-video.MP4', 'application/octet-stream', 'video/mp4']
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
    ['clipboard-video.MP4', 'application/octet-stream', 'video/mp4']
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
});
