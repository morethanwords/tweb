/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { fastRaf } from "../schedulers";
import sequentialDom from "../sequentialDom";
import renderImageFromUrl from "./renderImageFromUrl";

export default function renderImageWithFadeIn(
  container: HTMLElement, 
  image: HTMLImageElement, 
  url: string, 
  needFadeIn: boolean, 
  aspecter = container,
  thumbImage?: HTMLElement
) {
  if(needFadeIn) {
    image.classList.add('fade-in');
  }

  return new Promise<void>((resolve) => {
    /* if(photo._ === 'document') {
      console.error('wrapPhoto: will render document', photo, size, cacheContext);
      return resolve();
    } */

    renderImageFromUrl(image, url, () => {
      sequentialDom.mutateElement(container, () => {
        aspecter.append(image);

        fastRaf(() => {
          resolve();
        });

        if(needFadeIn) {
          image.addEventListener('animationend', () => {
            sequentialDom.mutate(() => {
              image.classList.remove('fade-in');
  
              if(thumbImage) {
                thumbImage.remove();
              }
            });
          }, {once: true});
        }
      });
    });
  });
}
