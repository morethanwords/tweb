import { IS_APPLE_MOBILE } from "../environment/userAgent";

export default function onMediaLoad(media: HTMLMediaElement, readyState = media.HAVE_METADATA, useCanplayOnIos?: boolean) {
  return new Promise<void>((resolve) => {
    if(media.readyState >= readyState) {
      resolve();
      return;
    }

    media.addEventListener(IS_APPLE_MOBILE && !useCanplayOnIos ? 'loadeddata' : 'canplay', () => resolve(), {once: true});
  });
}
