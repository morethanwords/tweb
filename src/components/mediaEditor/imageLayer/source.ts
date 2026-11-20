import getFileMimeType from '@helpers/files/getFileMimeType';

/** Deliberately bounded to JPEG + static PNG. No URL, SVG, animation or network input.
 * Desktop a532622: photo_editor_content.cpp:591–627, editor_paint.cpp:687–718.
 * Android 21f7d109: LPhotoPaintView.java:1323–1339,1394–1416 (one photo).
 */
export const STATIC_IMAGE_LAYER_ACCEPT = 'image/jpeg,image/png';
const MAX_BYTES = 32 * 1024 * 1024;
export const STATIC_IMAGE_LAYER_MAX_PIXELS = 40_000_000;

export type StaticImageSourceInfoV1 = {
  kind: 'file' | 'clipboard' | 'drop';
  name?: string;
  lastModified?: number;
};

/** Structured-clone payload, NOT JSON and NOT a durable object URL. Width/height
 * are the decoder's oriented pixels, shared by the preview and final rendering.
 */
export type StaticImageLayerPayloadV1 = {
  version: 1;
  blob: Blob;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  source: StaticImageSourceInfoV1;
};

/** Explicit web bound: exactly one file, never the first of a multi-file drop.
 * Browser-provided MIME wins over the extension, via the existing MIME helper.
 * Do not pass URI/HTML clipboard representations or recursively expanded folders.
 */
export function selectStaticImageLayerFile(files: readonly File[]): File | undefined {
  if(files.length !== 1) return;
  const file = files[0];
  if(isAllowedStaticImageMime(getFileMimeType(file)) && file.size > 0 && file.size <= MAX_BYTES) return file;
}

export function isAllowedStaticImageMime(mimeType: string): mimeType is StaticImageLayerPayloadV1['mimeType'] {
  return mimeType === 'image/jpeg' || mimeType === 'image/png';
}

export function validStaticImageSize(width: number, height: number) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
    width * height <= STATIC_IMAGE_LAYER_MAX_PIXELS;
}

/** Reject mislabeled bytes and APNG before any browser decode. PNG chunk lengths
 * are walked, not searched as text: an acTL-looking pixel payload is not a chunk.
 * The browser decoder still validates the compressed content/CRC afterwards.
 */
export async function validateStaticImageLayerBlob(blob: Blob, mimeType: string) {
  if(!blob || !isAllowedStaticImageMime(mimeType) || !blob.size || blob.size > MAX_BYTES) {
    throw new TypeError('Unsupported local image');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if(mimeType === 'image/jpeg') {
    if(bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) {
      throw new TypeError('Invalid JPEG image');
    }
    return bytes;
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if(!signature.every((byte, index) => bytes[index] === byte)) throw new TypeError('Invalid PNG image');
  const view = new DataView(bytes.buffer);
  let offset = 8, hasHeader = false;
  while(offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if(end > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if(!hasHeader) {
      if(type !== 'IHDR' || length !== 13 || !validStaticImageSize(view.getUint32(offset + 8), view.getUint32(offset + 12))) break;
      hasHeader = true;
    }
    if(type === 'acTL') throw new TypeError('Animated PNG is not a static image layer');
    if(type === 'IEND') {
      if(length === 0 && end === bytes.length && hasHeader) return bytes;
      break;
    }
    offset = end;
  }
  throw new TypeError('Invalid PNG chunks');
}
