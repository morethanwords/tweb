import type {MediaSize} from '@helpers/mediaSize';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import canvasToBlob from '@helpers/canvas/canvasToBlob';

export default async function scaleMediaElement<T extends {
  media: CanvasImageSource,
  mediaSize?: MediaSize,
  boxSize?: MediaSize,
  quality?: number,
  mimeType?: 'image/jpeg' | 'image/png',
  size?: MediaSize,
  // * the part of `media` to draw, in its natural pixels; the whole of it when omitted
  crop?: {x: number, y: number, width: number, height: number},
  toDataURL?: boolean
}>(options: T): Promise<T['toDataURL'] extends true ? {url: string, size: MediaSize} : {blob: Blob, size: MediaSize}> {
  const canvas = document.createElement('canvas');
  const size = options.size ?? options.mediaSize.aspectFitted(options.boxSize);
  const dpr = window.devicePixelRatio && 1;
  canvas.width = size.width * dpr;
  canvas.height = size.height * dpr;
  const ctx = canvas.getContext('2d');

  const {crop} = options;
  if(crop) {
    // * not createImageBitmap's source rect: Chromium cuts the wrong part of an EXIF-rotated image
    ctx.drawImage(options.media, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  } else if(IS_IMAGE_BITMAP_SUPPORTED) {
    const source = await createImageBitmap(options.media, {resizeWidth: size.width, resizeHeight: size.height});
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close();
  } else {
    ctx.drawImage(options.media, 0, 0, canvas.width, canvas.height);
  }

  const mimeType = options.mimeType ?? 'image/jpeg';
  const quality = options.quality ?? 1;
  if(options.toDataURL) {
    const url = canvas.toDataURL(mimeType, quality);
    return {url, size} as any;
  }

  const blob = await canvasToBlob(canvas, mimeType, quality);
  return {blob, size} as any;
}
