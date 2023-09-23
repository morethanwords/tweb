import {IS_APPLE_MOBILE} from '../environment/userAgent';

export function shouldIgnoreVideoError(e: ErrorEvent) {
  try {
    const target = e.target as HTMLVideoElement;
    const shouldIgnore = target.error.message.includes('URL safety check');
    if(shouldIgnore) {
      console.warn('will ignore video error', e);
    }
    return shouldIgnore;
  } catch(err) {
    return false;
  }
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
