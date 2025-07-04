import {getHeavyAnimationPromise} from '../../hooks/useHeavyAnimationCheck';
import {getCurrentAccount} from '../../lib/accounts/getCurrentAccount';
import {initVideoHls} from '../../lib/hls/initVideoHls';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {Middleware} from '../middleware';

function updateStreamInUse(url: string, inUse: boolean) {
  if(url.includes('stream/')) {
    apiManagerProxy.serviceMessagePort.invokeVoid('toggleStreamInUse', {url, inUse, accountNumber: getCurrentAccount()});
  }
}

// const createdVideos: Set<HTMLVideoElement> = new Set();
export default function createVideo({
  pip,
  middleware
}: {
  pip?: boolean,
  middleware?: Middleware
}) {
  const video = document.createElement('video');
  if(!pip) video.disablePictureInPicture = true;
  video.setAttribute('playsinline', 'true');
  // createdVideos.add(video);

  middleware?.onDestroy(async() => {
    // createdVideos.delete(video);
    await getHeavyAnimationPromise();
    video.src = '';
    video.load();
  });

  let originalSrc = video.src;
  Object.defineProperty(video, 'src', {
    get: () => {
      return originalSrc;
    },
    set: (newValue) => {
      updateStreamInUse(originalSrc, false);
      updateStreamInUse(newValue, true);

      originalSrc = newValue;

      if(newValue.startsWith('hls/')) {
        initVideoHls({video, src: newValue, middleware: middleware});
      } else {
        video.setAttribute('src', newValue);
      }
    }
  });

  return video;
}

// (window as any).createdVideos = createdVideos;
