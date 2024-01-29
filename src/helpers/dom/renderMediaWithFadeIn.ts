/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import sequentialDom from '../sequentialDom';
import {renderImageFromUrlPromise} from './renderImageFromUrl';

const UNMOUNT_THUMBS = true;

export default function renderMediaWithFadeIn({
  container,
  media,
  url,
  needFadeIn,
  aspecter = container,
  thumbImage,
  fadeInElement = media as any,
  onRender,
  onRenderFinish,
  useRenderCache
}: {
  container: HTMLElement,
  media: Parameters<typeof renderImageFromUrlPromise>[0],
  url: string,
  needFadeIn: boolean,
  aspecter?: HTMLElement,
  thumbImage?: HTMLElement,
  fadeInElement?: HTMLElement,
  onRender?: () => void,
  onRenderFinish?: () => void,
  useRenderCache?: boolean
}) {
  if(needFadeIn) {
    fadeInElement.classList.add('fade-in');
  }

  const promise = renderImageFromUrlPromise(media, url, useRenderCache).then(() => {
    return sequentialDom.mutateElement(container, () => {
      aspecter?.append(media);

      if(needFadeIn) {
        onRender?.();
        fadeInElement.addEventListener('animationend', () => {
          sequentialDom.mutate(() => {
            fadeInElement.classList.remove('fade-in');
            UNMOUNT_THUMBS && thumbImage?.remove();
            container.classList.add('no-background');
            onRenderFinish?.();
          });
        }, {once: true});
      } else {
        UNMOUNT_THUMBS && thumbImage?.remove();
        container.classList.add('no-background');
        onRender?.();
        onRenderFinish?.();
      }
    });
  });

  // recordPromise(promise, 'renderImageWithFadeIn');

  return promise;
}
