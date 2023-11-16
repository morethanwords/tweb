import createVideo from './dom/createVideo';
import {getMiddleware} from './middleware';

export default function preloadVideo(url: string) {
  const middlewareHelper = getMiddleware();
  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = createVideo({middleware: middlewareHelper.get()});
    video.volume = 0;
    video.addEventListener('loadedmetadata', () => resolve(video), {once: true});
    video.addEventListener('error', reject, {once: true});
    video.src = url;
  });

  promise.finally(() => {
    middlewareHelper.destroy();
  });

  return promise;
}
