/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function getVisibleRect(element: HTMLElement, overflowElement: HTMLElement, lookForSticky?: boolean) {
  const rect = element.getBoundingClientRect();
  const overflowRect = overflowElement.getBoundingClientRect();

  let {top: overflowTop, bottom: overflowBottom} = overflowRect;

  // * respect sticky headers
  if(lookForSticky) {
    const sticky = overflowElement.querySelector('.sticky');
    if(sticky) {
      const stickyRect = sticky.getBoundingClientRect();
      overflowTop = stickyRect.bottom;
    }
  }

  if(rect.top >= overflowBottom
    || rect.bottom <= overflowTop
    || rect.right <= overflowRect.left
    || rect.left >= overflowRect.right) {
    return null;
  }

  const overflow = {
    top: false,
    right: false,
    bottom: false,
    left: false,
    vertical: 0 as 0 | 1 | 2,
    horizontal: 0 as 0 | 1 | 2
  };

  // @ts-ignore
  const w: any = 'visualViewport' in window ? window.visualViewport : window;
  const windowWidth = w.width || w.innerWidth;
  const windowHeight = w.height || w.innerHeight;

  return {
    rect: {
      top: rect.top < overflowTop && overflowTop !== 0 ? (overflow.top = true, ++overflow.vertical, overflowTop) : rect.top,
      right: 0,
      bottom: rect.bottom > overflowBottom && overflowBottom !== windowHeight ? (overflow.bottom = true, ++overflow.vertical, overflowBottom) : rect.bottom,
      left: 0
    },
    overflow
  };
}

(window as any).getVisibleRect = getVisibleRect;
