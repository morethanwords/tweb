import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import {initVideoHls} from '@lib/hls/initVideoHls';
import apiManagerProxy from '@lib/apiManagerProxy';
import {Middleware} from '@helpers/middleware';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';

function updateStreamInUse(url: string, inUse: boolean, accountNumber: ActiveAccountNumber) {
  if(url.includes('stream/')) {
    apiManagerProxy.serviceMessagePort.invokeVoid('toggleStreamInUse', {url, inUse, accountNumber});
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
    clearMediaElementSource(video);
  });

  let originalSrc = video.src;
  // * the stream is the account's the source was set for: it is released after a switch too
  let srcAccountNumber = getCurrentAccount();
  Object.defineProperty(video, 'src', {
    get: () => {
      return originalSrc;
    },
    set: (newValue) => {
      updateStreamInUse(originalSrc, false, srcAccountNumber);
      srcAccountNumber = getCurrentAccount();
      updateStreamInUse(newValue, true, srcAccountNumber);

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
