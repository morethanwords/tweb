import {IS_APPLE_MOBILE} from '@environment/userAgent';
import rootScope from '@lib/rootScope';
import callbackify from '@helpers/callbackify';
import isCrbug1250841Error from '@helpers/fixChromiumMp4.constants';

const ignoredVideoErrors = new WeakSet<ErrorEvent>();
const fixingChromeBugSources = new WeakMap<HTMLVideoElement, string>();

export function shouldIgnoreVideoError(e: ErrorEvent) {
  if(ignoredVideoErrors.has(e)) {
    return true;
  }

  try {
    const target = e.target as HTMLVideoElement;
    const error = target.error;

    if(!error || error.message.includes('URL safety check')) {
      console.warn('will ignore video error', e);
      return true;
    }

    const isChromeBug = isCrbug1250841Error(error);
    if(isChromeBug && !(target as any).triedFixingChromeBug) {
      const originalSrc = target.src;
      if(fixingChromeBugSources.get(target) === originalSrc) {
        ignoredVideoErrors.add(e);
        return true;
      }

      let srcPromise: MaybePromise<string>;
      if(originalSrc.includes('stream/')) {
        srcPromise = originalSrc + '?_crbug1250841';
      } else {
        srcPromise = rootScope.managers.appDocsManager.fixChromiumMp4(originalSrc);
      }

      ignoredVideoErrors.add(e);
      fixingChromeBugSources.set(target, originalSrc);
      const fixing = callbackify(srcPromise, (src) => {
        if(fixingChromeBugSources.get(target) !== originalSrc) {
          return;
        }

        fixingChromeBugSources.delete(target);
        if(target.src !== originalSrc) {
          return;
        }

        (target as any).triedFixingChromeBug = true;
        if(src === originalSrc) {
          return;
        }

        target.src = src;
        target.load();
      });
      if(fixing instanceof Promise) {
        fixing.catch(() => {
          if(fixingChromeBugSources.get(target) === originalSrc) {
            fixingChromeBugSources.delete(target);
          }
        });
      }

      return true;
    } else if(isChromeBug) {
      console.error('chrome video error', e);
    }
  } catch(err) {}

  return false;
}

export default function onMediaLoad(
  media: HTMLMediaElement,
  readyState = media.HAVE_METADATA,
  useCanplayOnIos?: boolean
) {
  return new Promise<void>((resolve, reject) => {
    if(media.readyState >= readyState) {
      resolve();
      return;
    }

    const loadEventName = IS_APPLE_MOBILE && !useCanplayOnIos ? 'loadeddata' : 'canplay';
    const errorEventName = 'error';
    const cleanup = () => {
      media.removeEventListener(loadEventName, onLoad);
      media.removeEventListener(errorEventName, onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = (e: ErrorEvent) => {
      if(shouldIgnoreVideoError(e)) {
        return;
      }

      cleanup();
      reject(media.error);
    };
    media.addEventListener(loadEventName, onLoad, {once: true});
    media.addEventListener(errorEventName, onError);
  });
}
