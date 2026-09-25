import {makeMediaSize} from '@helpers/mediaSize';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import setCurrentTime from '@helpers/dom/setCurrentTime';

// iOS fits the uploaded video thumb into a square box (320), Android keeps the
// frame size as-is; 720 matches the media editor's thumbnail cap and stays
// sharp on retina bubbles (the old 320x240 box crippled portrait videos)
const POSTER_MAX_SIZE = 720;

export function createPosterFromMedia(
  media: HTMLVideoElement | HTMLImageElement,
  mimeType?: 'image/jpeg' | 'image/png'
) {
  let width: number, height: number;
  if(media instanceof HTMLVideoElement) {
    width = media.videoWidth;
    height = media.videoHeight;
  } else {
    width = media.naturalWidth;
    height = media.naturalHeight;
  }

  return scaleMediaElement({
    media,
    mediaSize: makeMediaSize(width, height),
    // clamp the box to the source so a smaller video is never upscaled
    boxSize: makeMediaSize(Math.min(width, POSTER_MAX_SIZE), Math.min(height, POSTER_MAX_SIZE)),
    mimeType,
    quality: .9
  });
}

export function createPosterFromVideo(video: HTMLVideoElement): ReturnType<typeof createPosterFromMedia> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => {
      video.onseeked = () => {
        createPosterFromMedia(video).then(resolve);

        video.onseeked = undefined;
      };

      setCurrentTime(video, 0);
    };

    video.onerror = reject;
    setCurrentTime(video, Math.min(video.duration, 1));
  });
}
