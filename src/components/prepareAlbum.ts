/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Layouter, RectPart} from './groupedLayout';

export default function prepareAlbum(options: {
  container: HTMLElement,
  items: {w: number, h: number}[],
  maxWidth: number,
  minWidth: number,
  spacing: number,
  maxHeight?: number,
  forMedia?: true,
  noGroupedItem?: boolean
}) {
  const layouter = new Layouter(options.items, options.maxWidth, options.minWidth, options.spacing, options.maxHeight);
  const layout = layouter.layout();

  const widthItem = layout.find((item) => item.sides & RectPart.Right);
  const width = widthItem.geometry.width + widthItem.geometry.x;

  const heightItem = layout.find((item) => item.sides & RectPart.Bottom);
  const height = heightItem.geometry.height + heightItem.geometry.y;

  const container = options.container;
  container.style.width = width + 'px';
  container.style.height = height + 'px';
  const children = container.children;

  layout.forEach(({geometry, sides}, idx) => {
    let div: HTMLElement;
    div = children[idx] as HTMLElement;
    if(!div) {
      div = document.createElement('div');
      container.append(div);
    }

    div.classList.add('album-item');
    if(!options.noGroupedItem) div.classList.add('grouped-item');

    div.style.width = (geometry.width / width * 100) + '%';
    div.style.height = (geometry.height / height * 100) + '%';
    div.style.top = (geometry.y / height * 100) + '%';
    div.style.left = (geometry.x / width * 100) + '%';

    if(sides & RectPart.Left && sides & RectPart.Top) {
      div.style.borderStartStartRadius = `calc(var(--border-start-start-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Left && sides & RectPart.Bottom) {
      div.style.borderEndStartRadius =  `calc(var(--border-end-start-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Right && sides & RectPart.Top) {
      div.style.borderStartEndRadius =  `calc(var(--border-start-end-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Right && sides & RectPart.Bottom) {
      div.style.borderEndEndRadius =  `calc(var(--border-end-end-radius) - ${options.spacing}px)`;
    }

    if(options.forMedia) {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');

      div.append(mediaDiv);
    }

    // @ts-ignore
    // div.style.backgroundColor = '#' + Math.floor(Math.random() * (2 ** 24 - 1)).toString(16).padStart(6, '0');
  });

  /* if(options.forMedia) {
    layout.forEach((_, i) => {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');

      options.container.children[i].append(mediaDiv);
    });
  } */
}
