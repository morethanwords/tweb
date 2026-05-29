import type {ButtonMenuDirection} from '@components/buttonMenuToggle';
import mediaSizes from '@helpers/mediaSizes';
import I18n from '@lib/langPack';
import clamp from './number/clamp';

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

export const DEFAULT_MENU_WINDOW_MARGIN = 16;

export type MenuHorizontalDirection = 'left' | 'right';

export type FloatingMenuSide = 'top' | 'left' | 'right' | 'bottom';
export type FloatingMenuAlignment = 'start' | 'center' | 'end';
export type FloatingMenuDirection = `${FloatingMenuSide}-${FloatingMenuAlignment}`;

const OPPOSITE_SIDE: Record<FloatingMenuSide, FloatingMenuSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
};

function canFitSide(
  triggerBcr: DOMRect,
  menu: HTMLElement,
  side: FloatingMenuSide,
  mainOffset: number
) {
  const margin = DEFAULT_MENU_WINDOW_MARGIN;
  switch(side) {
    case 'right':
      return triggerBcr.right + mainOffset + menu.clientWidth + margin <= window.innerWidth;
    case 'left':
      return triggerBcr.left - mainOffset - menu.clientWidth - margin >= 0;
    case 'bottom':
      return triggerBcr.bottom + mainOffset + menu.clientHeight + margin <= window.innerHeight;
    case 'top':
      return triggerBcr.top - mainOffset - menu.clientHeight - margin >= 0;
  }
}

/**
 * Positions a floating menu next to a trigger element.
 * - `side` is the side of the trigger the menu opens on.
 * - `alignment` aligns the menu along the perpendicular axis.
 * - `offset` is `[x, y]`. The component along the main axis acts as a gap from the trigger,
 *   the perpendicular component nudges along the alignment axis.
 *
 * Sets `left`, `top`, and `transformOrigin` on `menu`. Returns the actually used direction
 * (the side may flip to the opposite if the menu doesn't fit).
 */
export function positionFloatingMenu(
  triggerBcr: DOMRect,
  menu: HTMLElement,
  direction: FloatingMenuDirection,
  offset: [number, number] = [0, 0]
): FloatingMenuDirection {
  const [requestedSide, alignment] = direction.split('-') as [FloatingMenuSide, FloatingMenuAlignment];

  const isHorizontalSide = requestedSide === 'left' || requestedSide === 'right';
  const mainOffset = isHorizontalSide ? offset[0] : offset[1];
  const crossOffset = isHorizontalSide ? offset[1] : offset[0];

  // Flip side if it doesn't fit and the opposite does (mirrors the original right/left logic).
  const opposite = OPPOSITE_SIDE[requestedSide];
  const side: FloatingMenuSide = canFitSide(triggerBcr, menu, requestedSide, mainOffset) ||
      !canFitSide(triggerBcr, menu, opposite, mainOffset) ?
    requestedSide :
    opposite;

  const margin = DEFAULT_MENU_WINDOW_MARGIN;
  const menuW = menu.clientWidth;
  const menuH = menu.clientHeight;

  // Main-axis position.
  let left: number;
  let top: number;

  if(side === 'right' || side === 'left') {
    if(side === 'right') {
      left = triggerBcr.right + mainOffset;
    } else {
      left = triggerBcr.left - mainOffset - menuW;
    }
    left = clamp(left, margin, window.innerWidth - menuW - margin);

    // Cross axis: vertical.
    if(alignment === 'start') {
      top = triggerBcr.top + crossOffset;
    } else if(alignment === 'center') {
      top = triggerBcr.top + triggerBcr.height / 2 - menuH / 2 + crossOffset;
    } else {
      top = triggerBcr.bottom - menuH - crossOffset;
    }
    top = clamp(top, margin, window.innerHeight - menuH - margin);
  } else {
    if(side === 'bottom') {
      top = triggerBcr.bottom + mainOffset;
    } else {
      top = triggerBcr.top - mainOffset - menuH;
    }
    top = clamp(top, margin, window.innerHeight - menuH - margin);

    // Cross axis: horizontal.
    if(alignment === 'start') {
      left = triggerBcr.left + crossOffset;
    } else if(alignment === 'center') {
      left = triggerBcr.left + triggerBcr.width / 2 - menuW / 2 + crossOffset;
    } else {
      left = triggerBcr.right - menuW - crossOffset;
    }
    left = clamp(left, margin, window.innerWidth - menuW - margin);
  }

  // Transform origin: corner/edge closest to the trigger.
  let originX: string;
  let originY: string;
  const alignmentToPercent = alignment === 'start' ? '0' : alignment === 'center' ? '50%' : '100%';

  if(side === 'right' || side === 'left') {
    originX = side === 'right' ? '0' : '100%';
    originY = alignmentToPercent;
  } else {
    originY = side === 'bottom' ? '0' : '100%';
    originX = alignmentToPercent;
  }

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.transformOrigin = `${originX} ${originY}`;

  return `${side}-${alignment}` as FloatingMenuDirection;
}

export function getMenuTopPositionForStartDirection(triggerBcr: DOMRect, menu: HTMLElement, offset: [number, number]) {
  let top = triggerBcr.top + offset[1];
  const bottom = top + menu.clientHeight;
  if(bottom + DEFAULT_MENU_WINDOW_MARGIN > window.innerHeight) top -= bottom - window.innerHeight + DEFAULT_MENU_WINDOW_MARGIN;
  top = Math.max(top, DEFAULT_MENU_WINDOW_MARGIN);

  return top;
}

export function canMenuFitDirection(
  triggerBcr: DOMRect,
  menu: HTMLElement,
  direction: MenuHorizontalDirection,
  offset: [number, number]
) {
  if(direction === 'right') {
    const left = triggerBcr.right + offset[0];
    return left + menu.clientWidth + DEFAULT_MENU_WINDOW_MARGIN <= window.innerWidth;
  }

  const right = triggerBcr.left - offset[0];
  return right - menu.clientWidth - DEFAULT_MENU_WINDOW_MARGIN >= 0;
}

export function getMenuLeftPositionForDirection(
  triggerBcr: DOMRect,
  menu: HTMLElement,
  direction: MenuHorizontalDirection,
  offset: [number, number]
) {
  if(direction === 'right') {
    let left = triggerBcr.right + offset[0];
    const right = left + menu.clientWidth;
    if(right + DEFAULT_MENU_WINDOW_MARGIN > window.innerWidth) left -= right - window.innerWidth + DEFAULT_MENU_WINDOW_MARGIN;
    return left;
  }

  const right = triggerBcr.left - offset[0];
  let left = right - menu.clientWidth;
  if(left - DEFAULT_MENU_WINDOW_MARGIN < 0) left = DEFAULT_MENU_WINDOW_MARGIN;
  return left;
}

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

  if(I18n.getIsRTL()) side = mediaSizes.isMobile ? 'left' : 'right';
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
    (side === 'center' ? side : ((I18n.getIsRTL() ? side === 'right' : side === 'left') ? 'right' : 'left')));

  return {
    width: menuWidth,
    height: menuHeight
  };
}

export function positionMenuTrigger(trigger: HTMLElement, menu: HTMLElement, direction: ButtonMenuDirection, additionalPadding?: MenuPositionPadding) {
  const triggerRect = trigger.getBoundingClientRect();

  const [directionX, directionY] = direction.split('-');

  if(directionX === 'bottom') {
    const top = triggerRect.top + triggerRect.height + (additionalPadding?.top ?? 0);
    menu.style.top = `${Math.max(top, additionalPadding?.top ?? 0)}px`
  } else {
    const bottom = window.innerHeight - triggerRect.top + (additionalPadding?.bottom ?? 0)
    menu.style.bottom = `${Math.max(bottom, additionalPadding?.bottom ?? 0)}px`
  }

  if(directionY === 'right' || directionY === 'center') {
    const left = triggerRect.left + (additionalPadding?.left ?? 0);
    menu.style.left = `${Math.max(left, additionalPadding?.left ?? 0)}px`
  } else {
    const right = window.innerWidth - triggerRect.left - triggerRect.width - (additionalPadding?.right ?? 0)
    menu.style.right = `${Math.max(right, additionalPadding?.right ?? 0)}px`
  }

  if(directionY === 'center') {
    menu.style.setProperty('--parent-half-width', (trigger.clientWidth / 2) + 'px');
  }
}
