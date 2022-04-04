/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getVisibleRect from "./getVisibleRect";

export type ViewportSlicePart = {element: HTMLElement, rect: DOMRect, visibleRect: ReturnType<typeof getVisibleRect>}[];

export default function getViewportSlice({overflowElement, selector, extraSize}: {
  overflowElement: HTMLElement,
  selector: string,
  extraSize?: number
}) {
  // const perf = performance.now();
  const overflowRect = overflowElement.getBoundingClientRect();
  const elements = Array.from(overflowElement.querySelectorAll<HTMLElement>(selector));

  const invisibleTop: ViewportSlicePart = [], 
    visible: typeof invisibleTop = [], 
    invisibleBottom: typeof invisibleTop = [];
  let foundVisible = false;
  for(const element of elements) {
    const rect = element.getBoundingClientRect();
    const visibleRect = getVisibleRect(element, overflowElement, false, rect, overflowRect);
    
    const isVisible = !!visibleRect;
    let array: typeof invisibleTop;
    if(isVisible) {
      foundVisible = true;
      array = visible;
    } else if(foundVisible) {
      array = invisibleBottom; 
    } else {
      array = invisibleTop;
    }

    array.push({
      element,
      rect,
      visibleRect
    });
  }

  if(extraSize && visible.length) {
    const maxTop = visible[0].rect.top;
    const minTop = maxTop - extraSize;
    const minBottom = visible[visible.length - 1].rect.bottom;
    const maxBottom = minBottom + extraSize;
    
    for(let length = invisibleTop.length, i = length - 1; i >= 0; --i) {
      const element = invisibleTop[i];
      if(element.rect.top >= minTop) {
        invisibleTop.splice(i, 1);
        visible.unshift(element);
      }
    }

    for(let i = 0, length = invisibleBottom.length; i < length; ++i) {
      const element = invisibleBottom[i];
      if(element.rect.bottom <= maxBottom) {
        invisibleBottom.splice(i--, 1);
        --length;
        visible.push(element);
      }
    }
  }

  // console.log('getViewportSlice time:', performance.now() - perf);

  return {invisibleTop, visible, invisibleBottom};
}
