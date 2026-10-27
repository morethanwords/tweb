import getMediaViewerSnapshotSize from '@components/mediaViewer/snapshotSize';
import shouldSnapshotImage from '@components/mediaViewer/shouldSnapshotImage';

export type RenderedMedia = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

const RENDERED_MEDIA_SELECTOR = 'video, img, .canvas-thumbnail';

/**
 * What `target` shows on screen - a video's current frame once it has one, else the last image, video
 * or canvas in it - in a form another view can
 * start from at once. An image whose URL is still alive comes back as it is: a copy of its src reuses
 * the resource the browser has already decoded. A video frame, a canvas, or an image whose
 * worker-owned blob URL the LRU has dropped is copied onto a canvas, its backing store bounded to the
 * displayed size. When the copy fails (a video with no frame yet) the source comes back; when nothing
 * is drawn, nothing does.
 */
export default function snapshotRenderedMedia(target: HTMLElement, {
  width,
  height,
  devicePixelRatio = window.devicePixelRatio,
  alwaysCopy,
  processCanvas
}: {
  // * the displayed size
  width: number,
  height: number,
  devicePixelRatio?: number,
  // * copy even an image that could be reused as it is
  alwaysCopy?: boolean,
  processCanvas?: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
}): RenderedMedia {
  const queryFrom = target.matches(RENDERED_MEDIA_SELECTOR) ? target.parentElement : target;
  const rendered = Array.from(queryFrom.querySelectorAll<RenderedMedia>(RENDERED_MEDIA_SELECTOR));
  // * a video that has a frame is drawn over its poster (`.media-video` sits above `.media-photo`), even
  // * when the poster loaded later and came after it: its current frame, not the first one, is shown
  const source = rendered.find((element) => element instanceof HTMLVideoElement && element.readyState >= element.HAVE_CURRENT_DATA) ||
    rendered.pop();
  if(!source) {
    return;
  }

  if(!alwaysCopy && source instanceof HTMLImageElement && !shouldSnapshotImage(source)) {
    return source;
  }

  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth :
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight :
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const snapshotSize = getMediaViewerSnapshotSize({width, height, sourceWidth, sourceHeight, devicePixelRatio});
  const canvas = document.createElement('canvas');
  canvas.width = snapshotSize.width;
  canvas.height = snapshotSize.height;
  canvas.className = 'canvas-thumbnail thumbnail media-photo';
  const context = canvas.getContext('2d');
  if(!context) {
    return source;
  }

  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    processCanvas?.(context, canvas);
    return canvas;
  } catch{
    // * a video frame that is not ready yet, a protected canvas: the source is still a fallback
    return source;
  }
}

// * a new image on the same URL: a rendered one, put somewhere else
export function copyRenderedImage(image: HTMLImageElement) {
  const copy = new Image();
  copy.src = image.currentSrc || image.src;
  return copy;
}
