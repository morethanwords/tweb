import onMediaLoad from '@helpers/onMediaLoad';
import {
  beginLoadedURLLoad,
  finishLoadedURLLoad,
  hasLoadedURL
} from '@helpers/dom/loadedUrlCache';

type RenderTarget = HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement;

const set = (elem: RenderTarget, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLVideoElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

// Intended for blob/data media. Ordinary network URLs need a fresh load event.
export default function renderImageFromUrl(
  elem: RenderTarget,
  url: string,
  callback?: () => void,
  useCache?: boolean,
  processImageOnLoad?: (image: HTMLImageElement) => void
): MaybePromise<void> {
  if(processImageOnLoad) useCache = false;
  useCache ??= processImageOnLoad === undefined;

  if(!url) {
    console.error('renderImageFromUrl: no url?', elem, url);
    callback?.();
    return;
  }

  const isVideo = elem instanceof HTMLVideoElement;
  if(isVideo || (useCache && hasLoadedURL(url))) {
    set(elem, url);
    if(callback) {
      if(isVideo) {
        return onMediaLoad(elem).then(callback);
      }
      callback();
    }
    return;
  }

  const isImage = elem instanceof HTMLImageElement;
  const loader = isImage ? elem : new Image();
  const load = beginLoadedURLLoad(url);
  const onLoad = () => {
    if(!isImage && elem) {
      set(elem, url);
    }
    finishLoadedURLLoad(load, true);
    processImageOnLoad?.(loader);
    callback?.();
  };
  const onError = (err: DOMException) => {
    finishLoadedURLLoad(load, false);
    if(!err.message.includes('cannot be decoded')) {
      console.error('Render image from url failed:', err, url, loader, err.message, loader.naturalWidth);
    }
    callback?.();
  };

  loader.decoding = 'async';
  loader.src = url;
  return loader.decode().then(onLoad, onError);
}

export function renderImageFromUrlPromise(
  elem: RenderTarget,
  url: string,
  useCache?: boolean,
  processImageOnLoad?: (image: HTMLImageElement) => void
) {
  return new Promise<void>((resolve) => {
    renderImageFromUrl(elem, url, resolve, useCache, processImageOnLoad);
  });
}
