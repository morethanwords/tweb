/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import I18n from '../lib/langPack';
import mediaSizes from './mediaSizes';

export type MenuPositionPadding = {
  top?: number,
  right?: number,
  bottom?: number,
  left?: number
};

const PADDING_TOP = 8;
const PADDING_BOTTOM = PADDING_TOP;
const PADDING_LEFT = 8;
const PADDING_RIGHT = PADDING_LEFT;
export default function positionMenu(e: MouseEvent | Touch | TouchEvent, elem: HTMLElement, side?: 'left' | 'right' | 'center', additionalPadding?: MenuPositionPadding) {
  if((e as TouchEvent).touches) {
    e = (e as TouchEvent).touches[0];
  }

  const {pageX, pageY} = e as Touch;
  // let {clientX, clientY} = e;

  // * side mean the OPEN side

  const getScrollWidthFromElement = (Array.from(elem.children) as HTMLElement[]).find((element) => element.classList.contains('btn-menu-items') || (element.classList.contains('btn-menu-item') && !element.classList.contains('hide'))) || elem;

  let {scrollWidth: menuWidth} = getScrollWidthFromElement;
  const {scrollHeight: menuHeight} = elem;
  // let {innerWidth: windowWidth, innerHeight: windowHeight} = window;
  const rect = document.body.getBoundingClientRect();
  const windowWidth = rect.width;
  const windowHeight = rect.height;

  menuWidth += getScrollWidthFromElement.offsetLeft * 2;

  let paddingTop = PADDING_TOP, paddingRight = PADDING_RIGHT, paddingBottom = PADDING_BOTTOM, paddingLeft = PADDING_LEFT;
  if(additionalPadding) {
    if(additionalPadding.top) paddingTop += additionalPadding.top;
    if(additionalPadding.right) paddingRight += additionalPadding.right;
    if(additionalPadding.bottom) paddingBottom += additionalPadding.bottom;
    if(additionalPadding.left) paddingLeft += additionalPadding.left;
  }

  if(I18n.isRTL) side = mediaSizes.isMobile ? 'left' : 'right';
  else side = mediaSizes.isMobile ? 'right' : 'left';
  let verticalSide: 'top' /* | 'bottom' */ | 'center' = 'top';

  const maxTop = windowHeight - menuHeight - paddingBottom;
  const maxLeft = windowWidth - menuWidth - paddingRight;
  const minTop = paddingTop;
  const minLeft = paddingLeft;

  const getSides = () => {
    return {
      x: {
        left: pageX,
        right: Math.min(maxLeft, pageX - menuWidth)
      },
      intermediateX: side === 'right' ? minLeft : maxLeft,
      // intermediateX: clientX < windowWidth / 2 ? PADDING_LEFT : windowWidth - menuWidth - PADDING_LEFT,
      y: {
        top: pageY,
        bottom: pageY - menuHeight
      },
      // intermediateY: verticalSide === 'top' ? paddingTop : windowHeight - menuHeight - paddingTop,
      // intermediateY: pageY < (windowHeight / 2) ? paddingTop : windowHeight - menuHeight - paddingBottom,
      intermediateY: maxTop
    };
  };

  const sides = getSides();

  const possibleSides = {
    x: {
      left: (sides.x.left + menuWidth + paddingRight) <= windowWidth,
      right: sides.x.right >= paddingLeft
    },
    y: {
      top: (sides.y.top + menuHeight + paddingBottom) <= windowHeight,
      bottom: (sides.y.bottom - paddingBottom) >= paddingBottom
    }
  };

  /* if(side === undefined) {
    if((clientX + menuWidth + PADDING_LEFT) > windowWidth) {
      side = 'right';
    }
  } */

  {
    /* const x = sides.x;

    const s = Object.keys(x) as (keyof typeof possibleSides.x)[];
    if(side) {
      s.findAndSplice((s) => s === side);
      s.unshift(side);
    }

    const possibleSide = s.find((s) => possibleSides.x[s]); */
    // let left: number;
    /* if(possibleSide) {
      left = x[possibleSide];
      side = possibleSide;
    } else {
      left = sides.intermediateX;
      side = undefined;
    } */
    const left = possibleSides.x[side] ? sides.x[side] : (side = 'center', sides.intermediateX);

    elem.style.left = left + 'px';
  }

  /* if((clientY + menuHeight + PADDING_TOP) > windowHeight) {
    elem.style.top = clamp(clientY - menuHeight, PADDING_TOP, windowHeight - menuHeight - PADDING_TOP) + 'px';
    // elem.style.top = (innerHeight - scrollHeight - PADDING_TOP) + 'px';
    verticalSide = 'bottom';
  } else {
    elem.style.top = Math.max(PADDING_TOP, clientY) + 'px';
    verticalSide = 'top';
  } */

  {
    const top = possibleSides.y[verticalSide] ? sides.y[verticalSide] : (verticalSide = 'center', sides.intermediateY);

    elem.style.top = top + 'px';
  }

  elem.className = elem.className.replace(/(top|center|bottom)-(left|center|right)/g, '');
  elem.classList.add(
    // (verticalSide === 'center' ? verticalSide : (verticalSide === 'bottom' ? 'top' : 'bottom')) +
    (verticalSide === 'center' ? verticalSide : 'bottom') +
    '-' +
    (side === 'center' ? side : ((I18n.isRTL ? side === 'right' : side === 'left') ? 'right' : 'left')));

  return {
    width: menuWidth,
    height: menuHeight
  };
}
