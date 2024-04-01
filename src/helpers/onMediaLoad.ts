import {IS_APPLE_MOBILE} from '../environment/userAgent';
import rootScope from '../lib/rootScope';
import callbackify from './callbackify';
import isCrbug1250841Error from './fixChromiumMp4.constants';

export function shouldIgnoreVideoError(e: ErrorEvent) {
  try {
    const target = e.target as HTMLVideoElement;
    const error = target.error;

    if(!error || error.message.includes('URL safety check')) {
      console.warn('will ignore video error', e);
      return true;
    }

    const isChromeBug = isCrbug1250841Error(error);
    if(isChromeBug && !(target as any).triedFixingChromeBug) {
      let srcPromise: MaybePromise<string>;
      const originalSrc = target.src;
      if(originalSrc.includes('stream/')) {
        srcPromise = originalSrc + '?_crbug1250841';
      } else {
        srcPromise = rootScope.managers.appDocsManager.fixChromiumMp4(originalSrc);
      }

      callbackify(srcPromise, (src) => {
        (target as any).triedFixingChromeBug = true;
        if(target.src === src) {
          return;
        }

        target.src = src;
        target.load();
      });
      return true;
    } else if(isChromeBug) {
      console.error('chrome video error', e);
    }
  } catch(err) {}

  return false;
}

export default function onMediaLoad(media: HTMLMediaElement, readyState = media.HAVE_METADATA, useCanplayOnIos?: boolean) {
  return new Promise<void>((resolve, reject) => {
    if(media.readyState >= readyState) {
      resolve();
      return;
    }

    const loadEventName = IS_APPLE_MOBILE && !useCanplayOnIos ? 'loadeddata' : 'canplay';
    const errorEventName = 'error';
    const onLoad = () => {
      media.removeEventListener(errorEventName, onError);
      resolve();
    };
    const onError = (e: ErrorEvent) => {
      if(shouldIgnoreVideoError(e)) {
        return;
      }

      media.removeEventListener(loadEventName, onLoad);
      media.removeEventListener(errorEventName, onError);
      reject(media.error);
    };
    media.addEventListener(loadEventName, onLoad, {once: true});
    media.addEventListener(errorEventName, onError);
  });
}
