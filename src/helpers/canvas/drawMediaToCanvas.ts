export type DrawableMedia = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

/**
 * What the media shows right now — a video's or an animation's current frame — on a canvas of its own,
 * at its natural size. Nothing when it has no size yet. A canvas handed over to an OffscreenCanvas
 * (`data-offscreen`) comes out blank: its pixels live in a worker.
 */
export default function drawMediaToCanvas(media: DrawableMedia) {
  let width: number, height: number;
  if(media instanceof HTMLVideoElement) {
    width = media.videoWidth;
    height = media.videoHeight;
  } else if(media instanceof HTMLImageElement) {
    width = media.naturalWidth;
    height = media.naturalHeight;
  } else {
    width = media.width;
    height = media.height;
  }

  if(!width || !height) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(media, 0, 0);
  return canvas;
}
