import type { MediaSize } from "../mediaSize";

export default function scaleMediaElement(options: {
  media: CanvasImageSource, 
  mediaSize?: MediaSize, 
  boxSize?: MediaSize, 
  quality?: number,
  mimeType?: 'image/jpeg' | 'image/png',
  size?: MediaSize
}): Promise<{blob: Blob, size: MediaSize}> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const size = options.size ?? options.mediaSize.aspectFitted(options.boxSize);
    canvas.width = size.width * window.devicePixelRatio;
    canvas.height = size.height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(options.media, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      resolve({blob, size});
    }, options.mimeType ?? 'image/jpeg', options.quality ?? 1);
  });
}
