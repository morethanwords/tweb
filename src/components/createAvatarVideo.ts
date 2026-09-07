import animationIntersector, {AnimationItemWrapper} from '@components/animationIntersector';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import createLoopingMutedVideo from '@helpers/dom/createLoopingMutedVideo';
import liteMode from '@helpers/liteMode';
import {Middleware} from '@helpers/middleware';

export default function createAvatarVideo(url: string, startTime: number, middleware: Middleware, loopLimit?: number) {
  // Only the intersector may start playback. Native autoplay and load-event
  // retries would otherwise resume a video after it was paused off-screen.
  const video = createLoopingMutedVideo(url, 'avatar-photo avatar-video', startTime, middleware, false);
  let completedLoops = 0;
  video.loop = !loopLimit;
  const animation: AnimationItemWrapper = {
    get paused() { return video.paused; },
    get autoplay() { return (!loopLimit || completedLoops < loopLimit) && liteMode.isAvailable('video'); },
    loop: !loopLimit,
    play: () => {
      if(middleware() && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return video.play();
      }
    },
    pause: () => {
      video.pause();
      // Android resets the repeat counter when the drawable loses its parent,
      // not on an ordinary playback pause or a window focus change.
      if(!video.isConnected) completedLoops = 0;
    },
    remove: () => video.remove()
  };

  animationIntersector.addAnimation({
    animation,
    observeElement: video,
    controlled: middleware,
    type: 'video'
  });

  const checkPlayback = () => {
    const item = animationIntersector.getAnimations(video)[0];
    if(item) animationIntersector.checkAnimation(item);
  };
  const onEnded = () => {
    if(++completedLoops >= loopLimit) return;
    video.currentTime = 0;
    checkPlayback();
  };
  video.addEventListener('loadeddata', checkPlayback);
  video.addEventListener('canplay', checkPlayback);
  if(loopLimit) video.addEventListener('ended', onEnded);

  middleware.onClean(() => {
    video.removeEventListener('loadeddata', checkPlayback);
    video.removeEventListener('canplay', checkPlayback);
    video.removeEventListener('ended', onEnded);
    clearMediaElementSource(video);
    video.remove();
  });

  return video;
}
