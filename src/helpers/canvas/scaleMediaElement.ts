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
  toDataURL?: boolean
}>(options: T): Promise<T['toDataURL'] extends true ? {url: string, size: MediaSize} : {blob: Blob, size: MediaSize}> {
  const canvas = document.createElement('canvas');
  const size = options.size ?? options.mediaSize.aspectFitted(options.boxSize);
  const dpr = window.devicePixelRatio && 1;
  canvas.width = size.width * dpr;
  canvas.height = size.height * dpr;
  const ctx = canvas.getContext('2d');

  let source: CanvasImageSource;
  if(IS_IMAGE_BITMAP_SUPPORTED) {
    source = await createImageBitmap(options.media, {resizeWidth: size.width, resizeHeight: size.height});
  } else {
    source = options.media;
  }

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  if(IS_IMAGE_BITMAP_SUPPORTED) {
    (source as ImageBitmap)?.close();
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
