/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import onMediaLoad from '../onMediaLoad';

// import { getHeavyAnimationPromise } from "../../hooks/useHeavyAnimationCheck";

export const loadedURLs: {[url: string]: boolean} = {};
const set = (elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLVideoElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

// проблема функции в том, что она не подходит для ссылок, пригодна только для blob'ов, потому что обычным ссылкам нужен 'load' каждый раз.
export default function renderImageFromUrl(
  elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement,
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
  if(((loadedURLs[url]/*  && false */) && useCache) || isVideo) {
    /* if(isVideo) {
      const source = document.createElement('source');
      source.src = url;
      source.type = 'video/webm';
      elem.append(source);
    } else  */if(elem) {
      set(elem, url);
    }

    if(callback) {
      if(isVideo) {
        return onMediaLoad(elem).then(callback);
      } else {
        callback?.();
      }
      // callback && getHeavyAnimationPromise().then(() => callback());
    }
  } else {
    const isImage = elem instanceof HTMLImageElement;
    const loader = isImage ? elem : new Image();
    // const loader = new Image();
    // let perf = performance.now();

    const onLoad = () => {
      if(!isImage && elem) {
        set(elem, url);
      }

      loadedURLs[url] = true;
      // console.log('onload:', url, performance.now(), loader.naturalWidth, loader.naturalHeight);
      processImageOnLoad?.(loader);
      // TODO: переделать прогрузки аватаров до начала анимации, иначе с этим ожиданием они неприятно появляются
      // callback && getHeavyAnimationPromise().then(() => callback());
      callback?.();

      // if(loader.naturalWidth) {
      //   const interval = setInterval(() => {
      //     if(!loader.naturalWidth) {
      //       const parents = getParents(loader);
      //       console.warn('image no dimensions', loader.isConnected, parents, (parents[parents.length - 1] as HTMLElement).outerHTML, loader.src === url);
      //     }
      //   }, 1);

      //   setTimeout(() => clearInterval(interval), 1e3);
      // }
    };

    const onError = (err: DOMException) => {
      if(!err.message.includes('cannot be decoded')) {
        console.error('Render image from url failed:', err, url, loader, err.message, loader.naturalWidth);
      }

      callback?.();
    };

    loader.decoding = 'async';
    loader.src = url;
    return loader.decode().then(onLoad, onError);
    // const timeout = setTimeout(() => {
    //   console.error('not yet decoded', loader, url);
    //   debugger;
    // }, 1e3);
    // decodePromise.finally(() => {
    //   clearTimeout(timeout);
    // });
  }
}

export function renderImageFromUrlPromise(
  elem: Parameters<typeof renderImageFromUrl>[0],
  url: string,
  useCache?: boolean,
  processImageOnLoad?: (image: HTMLImageElement) => void
) {
  return new Promise<void>((resolve) => {
    renderImageFromUrl(elem, url, resolve, useCache, processImageOnLoad);
  });
}
