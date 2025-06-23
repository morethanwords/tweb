import deferredPromise from '../../../helpers/cancellablePromise';
import handleVideoLeak from '../../../helpers/dom/handleVideoLeak';
import onMediaLoad from '../../../helpers/onMediaLoad';

export default async function createVideoForDrawing(mediaSrc: string, currentTime = 0) {
  const deferred = deferredPromise<void>();

  const video = document.createElement('video');
  video.src = mediaSrc;
  video.autoplay = true;
  video.controls = false;

  let timeout: number;

  video.addEventListener('timeupdate', () => {
    video.pause();

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

  await deferred;
  self.clearTimeout(timeout);

  return video;
}
