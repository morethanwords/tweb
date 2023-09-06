import deferredPromise from '../cancellablePromise';
import onMediaLoad from '../onMediaLoad';
import safePlay from './safePlay';

export async function onVideoLeak(video: HTMLVideoElement) {
  // console.error('video is stuck', video.src, video, video.paused, videoPlaybackQuality);
  const firstElementChild = video.firstElementChild as HTMLSourceElement;
  if(!firstElementChild) {
    video.src = '';
    video.load();
    throw new Error('leak');
  }

  const paused = video.paused;
  firstElementChild.remove();
  video.load();

  if(!video.childElementCount && !video.src) {
    throw new Error('leak');
  }

  if(!paused) safePlay(video);
  else video.currentTime = 0.0001;

  return handleVideoLeak(video, onMediaLoad(video));
}

export async function testVideoLeak(
  video: HTMLVideoElement,
  isLeak = !video.getVideoPlaybackQuality().totalVideoFrames
) {
  if(!isLeak) {
    return;
  }

  return onVideoLeak(video);
}

// * fix new memory leak of chrome
export default async function handleVideoLeak(video: HTMLVideoElement, loadPromise?: Promise<any>) {
  const onTimeUpdate = () => {
    testVideoLeak(video).then(
      deferred.resolve.bind(deferred),
      deferred.reject.bind(deferred)
    );
  };

  const deferred = deferredPromise<void>();
  try {
    await loadPromise;
  } catch(err) {
    onTimeUpdate();
    return;
  }

  if(video.getVideoPlaybackQuality().totalVideoFrames) {
    return;
  }

  video.addEventListener('timeupdate', onTimeUpdate, {once: true});
  return deferred;
}
