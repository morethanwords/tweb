/**
 * Android Enhance's calcCDT, DrKLO/Telegram @ 21f7d109,
 * TMessagesProj/jni/image.cpp:519–612. Input matches FilterShaders.java:348–421,
 * 1554–1628: tightly packed HSV RGBA8 readPixels bytes (V at byte 2).
 *
 * Returns a new 256 × 16 RGBA8 LUT: [CDF, first nonzero CDF, last CDF, 255].
 * Rows are tileY * 4 + tileX, in the input's physical row order, not UI direction.
 * Keep readback and this O(width * height) computation off the tab's render hot
 * path in future integration; this helper alone does not implement Enhance.
 *
 * Native float32 rounding, truncation, uneven tile assignment and normalization
 * by floor(width / 4) * floor(height / 4) are intentional. Below 4 pixels on
 * either axis native divides by zero: we instead return an identity LUT with
 * a nonzero normalization range. Input is not mutated; alpha is ignored.
 */
export default function nativeEnhanceHistogram(
  hsv: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
    !Number.isSafeInteger(width * height * 4) || hsv.length < width * height * 4) {
    throw new RangeError('Expected positive image dimensions and packed HSV RGBA8 pixels');
  }

  const result = new Uint8Array(256 * 16 * 4);
  const tileArea = Math.floor(width / 4) * Math.floor(height / 4);
  if(!tileArea) {
    for(let tile = 0; tile < 16; ++tile) {
      for(let bin = 0; bin < 256; ++bin) {
        const offset = (tile * 256 + bin) * 4;
        result[offset] = bin;
        result[offset + 2] = 255;
        result[offset + 3] = 255;
      }
    }
    return result;
  }

  const f32 = Math.fround;
  const clipLimit = Math.floor(Math.max(1, f32(f32(1.25 * f32(tileArea)) / 256)));
  const scale = f32(255 / f32(tileArea));
  const xMul = f32(4 / f32(width));
  const yMul = f32(4 / f32(height));
  const hist = new Uint32Array(16 * 256);
  // Precompute horizontal tile offsets instead of rounding once per pixel.
  const columns = new Uint16Array(width);
  for(let x = 0; x < width; ++x) {
    columns[x] = Math.floor(f32(f32(x) * xMul)) * 256;
  }
  for(let y = 0; y < height; ++y) {
    const tileRow = Math.floor(f32(f32(y) * yMul)) * 4 * 256;
    let pixel = y * width * 4 + 2;
    for(let x = 0; x < width; ++x, pixel += 4) {
      ++hist[tileRow + columns[x] + hsv[pixel]];
    }
  }

  for(let tile = 0; tile < 16; ++tile) {
    const start = tile * 256;
    let clipped = 0;
    for(let bin = 0; bin < 256; ++bin) {
      if(hist[start + bin] > clipLimit) {
        clipped += hist[start + bin] - clipLimit;
        hist[start + bin] = clipLimit;
      }
    }
    const batch = Math.floor(clipped / 256);
    const residual = clipped - batch * 256;
    let first = -1;
    let cdf = 0;
    for(let bin = 0; bin < 256; ++bin) {
      const count = hist[start + bin] + batch + (bin < residual ? 1 : 0);
      cdf += count;
      const value = Math.floor(Math.min(255, f32(f32(cdf) * scale)));
      result[(start + bin) * 4] = value;
      if(first === -1 && count) first = value;
    }
    const last = result[(start + 255) * 4];
    for(let bin = 0; bin < 256; ++bin) {
      const offset = (start + bin) * 4;
      result[offset + 1] = first;
      result[offset + 2] = last;
      result[offset + 3] = 255;
    }
  }
  return result;
}
