import prepare, {PHOTO_HEAVY_BYTES, PHOTO_COMPRESSED_QUALITY} from '@helpers/canvas/photoUploadPreparation';

describe('shared photo upload preparation', () => {
  test('preserves a small lossless photo and the size threshold itself', () => {
    expect(prepare(600, 400, 'image/png', PHOTO_HEAVY_BYTES)).toBeUndefined();
  });

  test('compresses a heavy lossless photo without upscaling it', () => {
    expect(prepare(600, 400, 'image/png', PHOTO_HEAVY_BYTES + 1)).toMatchObject({
      boxSize: {width: 600, height: 400},
      mediaSize: {width: 600, height: 400},
      quality: PHOTO_COMPRESSED_QUALITY
    });
  });

  test('limits an oversized photo without reducing resize quality', () => {
    expect(prepare(5000, 1200, 'image/jpeg', 10)).toMatchObject({
      boxSize: {width: 2560, height: 1200},
      mediaSize: {width: 5000, height: 1200},
      quality: undefined
    });
  });

  test('converts incompatible formats only when requested and leaves GIF conversion to its own path', () => {
    expect(prepare(600, 400, 'image/webp', 10)).toBeUndefined();
    expect(prepare(600, 400, 'image/webp', 10, true)).toBeDefined();
    expect(prepare(5000, 5000, 'image/gif', PHOTO_HEAVY_BYTES + 1, true)).toBeUndefined();
  });
});
