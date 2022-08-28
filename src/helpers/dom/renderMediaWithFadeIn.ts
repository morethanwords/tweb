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
  thumbImage?: HTMLElement
) {
  if(needFadeIn) {
    media.classList.add('fade-in');
  }

  const promise = renderImageFromUrlPromise(media, url).then(() => {
    return sequentialDom.mutateElement(container, () => {
      aspecter.append(media);

      if(needFadeIn) {
        media.addEventListener('animationend', () => {
          sequentialDom.mutate(() => {
            media.classList.remove('fade-in');
            thumbImage?.remove();
          });
        }, {once: true});
      } else {
        thumbImage?.remove();
      }
    });
  });

  // recordPromise(promise, 'renderImageWithFadeIn');

  return promise;
}
