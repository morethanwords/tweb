import {getHeavyAnimationPromise} from '../../hooks/useHeavyAnimationCheck';
import {Middleware} from '../middleware';

const createdVideos: Set<HTMLVideoElement> = new Set();
export default function createVideo({
  pip,
  middleware
}: {
  pip?: boolean,
  middleware: Middleware
}) {
  const video = document.createElement('video');
  if(!pip) video.disablePictureInPicture = true;
  video.setAttribute('playsinline', 'true');
  createdVideos.add(video);

  middleware?.onDestroy(async() => {
    createdVideos.delete(video);
    await getHeavyAnimationPromise();
    video.src = '';
    video.load();
  });

  return video;
}

(window as any).createdVideos = createdVideos;
