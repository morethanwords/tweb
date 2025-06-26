import deferredPromise from '../../../helpers/cancellablePromise';
import handleVideoLeak from '../../../helpers/dom/handleVideoLeak';
import onMediaLoad from '../../../helpers/onMediaLoad';

type Options = {
  /**
   * [0, 1] will be multiplied by duration
   */
  currentTime?: number;

  waitToSeek?: boolean;
};

export default async function createVideoForDrawing(mediaSrc: string, options: Options = {}) {
  const deferred = deferredPromise<void>();

  const currentTime = options.currentTime ?? 0;
  const waitToSeek = options.waitToSeek ?? true;

  const video = document.createElement('video');
  video.src = mediaSrc;
  video.autoplay = true;
  video.controls = false;

  let timeout: number;

  video.addEventListener('timeupdate', () => {
    video.pause();

    if(!waitToSeek) return;

    video.addEventListener('seeked', () => void deferred.resolve(), {once: true});
    timeout = self.setTimeout(() => deferred.resolve(), 500); // just in case

    video.currentTime = video.duration * currentTime;
  }, {once: true});


  // Theoretically we should not have any errors here as this is handled in the media popup
  try {
    const promise = onMediaLoad(video);
    await handleVideoLeak(video, promise);
  } catch{
    deferred.reject();
  }

  if(waitToSeek) await deferred;
  self.clearTimeout(timeout);

  return video;
}
