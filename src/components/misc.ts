/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../config/debug";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import { CLICK_EVENT_NAME } from "../helpers/dom/clickEvent";
import ListenerSetter from "../helpers/listenerSetter";
import mediaSizes from "../helpers/mediaSizes";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import { IS_APPLE, IS_MOBILE_SAFARI } from "../environment/userAgent";
import rootScope from "../lib/rootScope";
import appNavigationController from "./appNavigationController";

export function putPreloader(elem: Element, returnDiv = false): HTMLElement {
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;

  if(returnDiv) {
    const div = document.createElement('div');
    div.classList.add('preloader');
    div.innerHTML = html;

    if(elem) {
      elem.appendChild(div);
    }

    return div;
  }
  
  elem.insertAdjacentHTML('beforeend', html);
  return elem.lastElementChild as HTMLElement;
}

MOUNT_CLASS_TO.putPreloader = putPreloader;

export function setButtonLoader(elem: HTMLButtonElement, icon = 'check') {
  elem.classList.remove('tgico-' + icon);
  elem.disabled = true;
  putPreloader(elem);

  return () => {
    elem.innerHTML = '';
    elem.classList.add('tgico-' + icon);
    elem.removeAttribute('disabled');
  };
}

/* export function parseMenuButtonsTo(to: {[name: string]: HTMLElement}, elements: HTMLCollection | NodeListOf<HTMLElement>) {
  Array.from(elements).forEach(el => {
    const match = el.className.match(/(?:^|\s)menu-(.+?)(?:$|\s)/);
    if(!match) return;
    to[match[1]] = el as HTMLElement;
  });
} */

let onMouseMove = (e: MouseEvent) => {
  let rect = openedMenu.getBoundingClientRect();
  let {clientX, clientY} = e;
  
  let diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
  let diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;
  
  if(diffX >= 100 || diffY >= 100) {
    closeBtnMenu();
    //openedMenu.parentElement.click();
  }
  //console.log('mousemove', diffX, diffY);
};

const onClick = (e: MouseEvent | TouchEvent) => {
  //cancelEvent(e);
  closeBtnMenu();
};

// ! no need in this due to the same handler in appNavigationController
/* const onKeyDown = (e: KeyboardEvent) => {
  if(e.key === 'Escape') {
    closeBtnMenu();
    cancelEvent(e);
  }
}; */

export const closeBtnMenu = () => {
  if(openedMenu) {
    openedMenu.classList.remove('active');
    openedMenu.parentElement.classList.remove('menu-open');
    //openedMenu.previousElementSibling.remove(); // remove overlay
    if(menuOverlay) menuOverlay.remove();
    openedMenu = null;

    rootScope.dispatchEvent('context_menu_toggle', false);
  }
  
  if(openedMenuOnClose) {
    openedMenuOnClose();
    openedMenuOnClose = null;
  }

  if(!IS_TOUCH_SUPPORTED) {
    window.removeEventListener('mousemove', onMouseMove);
    //window.removeEventListener('keydown', onKeyDown, {capture: true});
    window.removeEventListener('contextmenu', onClick);
  }

  document.removeEventListener(CLICK_EVENT_NAME, onClick);

  if(!IS_MOBILE_SAFARI) {
    appNavigationController.removeByType('menu');
  }
};

window.addEventListener('resize', () => {
  if(openedMenu) {
    closeBtnMenu();
  }
  
  /* if(openedMenu && (openedMenu.style.top || openedMenu.style.left)) {
    const rect = openedMenu.getBoundingClientRect();
    const {innerWidth, innerHeight} = window;

    console.log(innerWidth, innerHeight, rect);
  } */
});

let openedMenu: HTMLElement = null, openedMenuOnClose: () => void = null, menuOverlay: HTMLElement = null;
export function openBtnMenu(menuElement: HTMLElement, onClose?: () => void) {
  closeBtnMenu();

  if(!IS_MOBILE_SAFARI) {
    appNavigationController.pushItem({
      type: 'menu',
      onPop: (canAnimate) => {
        closeBtnMenu();
      }
    });
  }
  
  openedMenu = menuElement;
  openedMenu.classList.add('active');
  openedMenu.parentElement.classList.add('menu-open');

  if(!menuOverlay) {
    menuOverlay = document.createElement('div');
    menuOverlay.classList.add('btn-menu-overlay');

    // ! because this event must be canceled, and can't cancel on menu click (below)
    menuOverlay.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      onClick(e);
    });
  }

  openedMenu.parentElement.insertBefore(menuOverlay, openedMenu);

  //document.body.classList.add('disable-hover');
  
  openedMenuOnClose = onClose;

  if(!IS_TOUCH_SUPPORTED) {
    window.addEventListener('mousemove', onMouseMove);
    //window.addEventListener('keydown', onKeyDown, {capture: true});
    window.addEventListener('contextmenu', onClick, {once: true});
  }

  /* // ! because this event must be canceled, and can't cancel on menu click (below)
  overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
    cancelEvent(e);
    onClick(e);
  }); */
  
  // ! safari iOS doesn't handle window click event on overlay, idk why
  document.addEventListener(CLICK_EVENT_NAME, onClick);

  rootScope.dispatchEvent('context_menu_toggle', true);
}

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
export function positionMenu({pageX, pageY}: MouseEvent | Touch, elem: HTMLElement, side?: 'left' | 'right' | 'center', additionalPadding?: MenuPositionPadding) {
  //let {clientX, clientY} = e;

  // * side mean the OPEN side

  const getScrollWidthFromElement = (Array.from(elem.children) as HTMLElement[]).find(element => element.classList.contains('btn-menu-item') && !element.classList.contains('hide')) || elem;

  let {scrollWidth: menuWidth} = getScrollWidthFromElement;
  let {scrollHeight: menuHeight} = elem;
  //let {innerWidth: windowWidth, innerHeight: windowHeight} = window;
  const rect = document.body.getBoundingClientRect();
  const windowWidth = rect.width;
  const windowHeight = rect.height;

  let paddingTop = PADDING_TOP, paddingRight = PADDING_RIGHT, paddingBottom = PADDING_BOTTOM, paddingLeft = PADDING_LEFT;
  if(additionalPadding) {
    if(additionalPadding.top) paddingTop += additionalPadding.top;
    if(additionalPadding.right) paddingRight += additionalPadding.right;
    if(additionalPadding.bottom) paddingBottom += additionalPadding.bottom;
    if(additionalPadding.left) paddingLeft += additionalPadding.left;
  }

  side = mediaSizes.isMobile ? 'right' : 'left';
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
      //intermediateX: clientX < windowWidth / 2 ? PADDING_LEFT : windowWidth - menuWidth - PADDING_LEFT,
      y: {
        top: pageY,
        bottom: pageY - menuHeight
      },
      //intermediateY: verticalSide === 'top' ? paddingTop : windowHeight - menuHeight - paddingTop,
      // intermediateY: pageY < (windowHeight / 2) ? paddingTop : windowHeight - menuHeight - paddingBottom,
      intermediateY: maxTop,
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
      s.findAndSplice(s => s === side);
      s.unshift(side);
    }

    const possibleSide = s.find(s => possibleSides.x[s]); */
    let left: number;
    /* if(possibleSide) {
      left = x[possibleSide];
      side = possibleSide;
    } else {
      left = sides.intermediateX;
      side = undefined;
    } */
    left = possibleSides.x[side] ? sides.x[side] : (side = 'center', sides.intermediateX);
  
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
    let top: number;

    top = possibleSides.y[verticalSide] ? sides.y[verticalSide] : (verticalSide = 'center', sides.intermediateY);
  
    elem.style.top = top + 'px';
  }
  
  elem.className = elem.className.replace(/(top|center|bottom)-(left|center|right)/g, '');
  elem.classList.add(
    //(verticalSide === 'center' ? verticalSide : (verticalSide === 'bottom' ? 'top' : 'bottom')) +
    (verticalSide === 'center' ? verticalSide : 'bottom') +
    '-' +
    (side === 'center' ? side : (side === 'left' ? 'right' : 'left')));

  return {
    width: menuWidth,
    height: menuHeight
  };
}

let _cancelContextMenuOpening = false, _cancelContextMenuOpeningTimeout = 0;
export function cancelContextMenuOpening() {
  if(_cancelContextMenuOpeningTimeout) {
    clearTimeout(_cancelContextMenuOpeningTimeout);
  }
    
  _cancelContextMenuOpeningTimeout = window.setTimeout(() => {
    _cancelContextMenuOpeningTimeout = 0;
    _cancelContextMenuOpening = false;
  }, .4e3);

  _cancelContextMenuOpening = true;
}

export function attachContextMenuListener(element: HTMLElement, callback: (e: Touch | MouseEvent) => void, listenerSetter?: ListenerSetter) {
  const add = listenerSetter ? listenerSetter.add(element) : element.addEventListener.bind(element);
  const remove = listenerSetter ? listenerSetter.removeManual.bind(listenerSetter, element) : element.removeEventListener.bind(element);

  if(IS_APPLE && IS_TOUCH_SUPPORTED) {
    let timeout: number;

    const options: EventListenerOptions = {capture: true};

    const onCancel = () => {
      clearTimeout(timeout);
      // @ts-ignore
      remove('touchmove', onCancel, options);
      // @ts-ignore
      remove('touchend', onCancel, options);
      // @ts-ignore
      remove('touchcancel', onCancel, options);
    };

    add('touchstart', (e: TouchEvent) => {
      if(e.touches.length > 1) {
        onCancel();
        return;
      }
  
      add('touchmove', onCancel, options);
      add('touchend', onCancel, options);
      add('touchcancel', onCancel, options);

      timeout = window.setTimeout(() => {
        if(_cancelContextMenuOpening) {
          onCancel();
          return;
        }

        callback(e.touches[0]);
        onCancel();

        if(openedMenu) {
          element.addEventListener('touchend', cancelEvent, {once: true}); // * fix instant closing
        }
      }, .4e3);
    });

    /* if(!isSafari) {
      add('contextmenu', (e: any) => {
        cancelEvent(e);
      }, {passive: false, capture: true});
    } */
  } else {
    add('contextmenu', IS_TOUCH_SUPPORTED ? (e: any) => {
      callback(e);

      if(openedMenu) {
        element.addEventListener('touchend', cancelEvent, {once: true}); // * fix instant closing
      }
    } : callback);
  }
};
