import {IS_APPLE_MOBILE} from '../environment/userAgent';

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
      media.removeEventListener(loadEventName, onLoad);
      reject(media.error);
    };
    media.addEventListener(loadEventName, onLoad, {once: true});
    media.addEventListener(errorEventName, onError, {once: true});
  });
}
