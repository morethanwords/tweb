/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import customProperties from '../../helpers/dom/customProperties';
import textToSvgURL from '../../helpers/textToSvgURL';
import rootScope from '../../lib/rootScope';
import wrapPhoto from './photo';

let addedThemeListener = false;
export default function wrapAttachBotIcon({
  doc,
  element: iconElement,
  size,
  textColor,
  strokeWidth
}: {
  doc: MyDocument,
  element: HTMLElement,
  size: number,
  textColor: () => string,
  strokeWidth: () => number
}) {
  iconElement.classList.add('is-external');

  if(!addedThemeListener) {
    addedThemeListener = true;

    rootScope.addEventListener('theme_changed', () => {
      const elements = document.querySelectorAll<HTMLElement>('.is-external');
      elements.forEach((element) => {
        const set = (element as any).set;
        set?.(true);
      });
    });
  }

  const set = async(manual?: boolean) => {
    const svg: SVGSVGElement = (iconElement as any).svg;
    const color = customProperties.getProperty(textColor());
    svg.querySelectorAll('path').forEach((path) => {
      path.setAttributeNS(null, 'fill', color);
      path.style.stroke = color;
      path.style.strokeWidth = strokeWidth() + 'px';
    });

    const url = await textToSvgURL(svg.outerHTML);
    if(!manual) {
      return url;
    }

    ((iconElement as any).image as HTMLImageElement).src = url;
  };

  const originalPromise = wrapPhoto({
    container: iconElement,
    photo: doc,
    boxWidth: size,
    boxHeight: size,
    withoutPreloader: true,
    noFadeIn: true,
    noBlur: true,
    processUrl: async(url) => {
      const text = await (await fetch(url)).text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = doc.firstElementChild as HTMLElement;
      (iconElement as any).svg = svg;
      (iconElement as any).set = set;
      return set();
    }
  });

  return originalPromise.then(async(ret) => {
    iconElement.style.width = iconElement.style.height = '';
    (iconElement as any).image = ret.images.full;
    await ret.loadPromises.thumb;
    return originalPromise;
  });
}
