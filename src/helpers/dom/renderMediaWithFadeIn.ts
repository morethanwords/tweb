/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import sequentialDom from '../sequentialDom';
import {renderImageFromUrlPromise} from './renderImageFromUrl';

export default function renderMediaWithFadeIn(
  container: HTMLElement,
  media: Parameters<typeof renderImageFromUrlPromise>[0],
  url: string,
  needFadeIn: boolean,
  aspecter = container,
  thumbImage?: HTMLElement,
  fadeInElement = media,
  onRender?: () => void,
  onRenderFinish?: () => void
) {
  if(needFadeIn) {
    fadeInElement.classList.add('fade-in');
  }

  const promise = renderImageFromUrlPromise(media, url).then(() => {
    return sequentialDom.mutateElement(container, () => {
      aspecter?.append(media);

      if(needFadeIn) {
        onRender?.();
        fadeInElement.addEventListener('animationend', () => {
          sequentialDom.mutate(() => {
            fadeInElement.classList.remove('fade-in');
            thumbImage?.remove();
            onRenderFinish?.();
          });
        }, {once: true});
      } else {
        thumbImage?.remove();
        onRender?.();
        onRenderFinish?.();
      }
    });
  });

  // recordPromise(promise, 'renderImageWithFadeIn');

  return promise;
}
