/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../config/debug";
import Countries, { Country, PhoneCodesMain } from "../countries";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import { CLICK_EVENT_NAME } from "../helpers/dom/clickEvent";
import ListenerSetter from "../helpers/listenerSetter";
import mediaSizes from "../helpers/mediaSizes";
import { isTouchSupported } from "../helpers/touchSupport";
import { isApple, isMobileSafari } from "../helpers/userAgent";
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

let sortedCountries: Country[];
export function formatPhoneNumber(str: string) {
  str = str.replace(/\D/g, '');
  let phoneCode = str.slice(0, 6);
  
  ////console.log('str', str, phoneCode);
  if(!sortedCountries) {
    sortedCountries = Countries.slice().sort((a, b) => b.phoneCode.length - a.phoneCode.length);
  }
  
  let country = sortedCountries.find((c) => {
    return c.phoneCode.split(' and ').find((c) => phoneCode.indexOf(c.replace(/\D/g, '')) === 0);
  });

  if(!country) return {formatted: str, country};

  country = PhoneCodesMain[country.phoneCode] || country;
  
  let pattern = country.pattern || country.phoneCode;
  pattern.split('').forEach((symbol, idx) => {
    if(symbol === ' ' && str[idx] !== ' ' && str.length > idx) {
      str = str.slice(0, idx) + ' ' + str.slice(idx);
    }
  });
  
  /* if(country.pattern) {
    str = str.slice(0, country.pattern.length);
  } */
  
  return {formatted: str, country};
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
  }
  
  if(openedMenuOnClose) {
    openedMenuOnClose();
    openedMenuOnClose = null;
  }

  if(!isTouchSupported) {
    window.removeEventListener('mousemove', onMouseMove);
    //window.removeEventListener('keydown', onKeyDown, {capture: true});
    window.removeEventListener('contextmenu', onClick);
  }

  document.removeEventListener(CLICK_EVENT_NAME, onClick);

  if(!isMobileSafari) {
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

  if(!isMobileSafari) {
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

  if(!isTouchSupported) {
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
}

const PADDING_TOP = 8;
const PADDING_LEFT = 8;
export function positionMenu({pageX, pageY}: MouseEvent | Touch, elem: HTMLElement, side?: 'left' | 'right' | 'center') {
  //let {clientX, clientY} = e;

  // * side mean the OPEN side

  let {scrollWidth: menuWidth, scrollHeight: menuHeight} = elem;
  //let {innerWidth: windowWidth, innerHeight: windowHeight} = window;
  const rect = document.body.getBoundingClientRect();
  const windowWidth = rect.width;
  const windowHeight = rect.height;

  side = mediaSizes.isMobile ? 'right' : 'left';
  let verticalSide: 'top' /* | 'bottom' */ | 'center' = 'top';

  const getSides = () => {
    return {
      x: {
        left: pageX,
        right: pageX - menuWidth
      },
      intermediateX: side === 'right' ? PADDING_LEFT : windowWidth - menuWidth - PADDING_LEFT,
      //intermediateX: clientX < windowWidth / 2 ? PADDING_LEFT : windowWidth - menuWidth - PADDING_LEFT,
      y: {
        top: pageY,
        bottom: pageY - menuHeight
      },
      //intermediateY: verticalSide === 'top' ? PADDING_TOP : windowHeight - menuHeight - PADDING_TOP,
      intermediateY: pageY < windowHeight / 2 ? PADDING_TOP : windowHeight - menuHeight - PADDING_TOP,
    };
  };

  const sides = getSides();

  const possibleSides = {
    x: {
      left: sides.x.left + menuWidth + PADDING_LEFT <= windowWidth,
      right: sides.x.right >= PADDING_LEFT
    },
    y: {
      top: sides.y.top + menuHeight + PADDING_TOP <= windowHeight,
      bottom: sides.y.bottom - PADDING_TOP >= PADDING_TOP
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
}

export function attachContextMenuListener(element: HTMLElement, callback: (e: Touch | MouseEvent) => void, listenerSetter?: ListenerSetter) {
  const add = listenerSetter ? listenerSetter.add(element) : element.addEventListener.bind(element);
  const remove = listenerSetter ? listenerSetter.removeManual.bind(listenerSetter, element) : element.removeEventListener.bind(element);

  if(isApple && isTouchSupported) {
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
    add('contextmenu', isTouchSupported ? (e: any) => {
      callback(e);

      if(openedMenu) {
        element.addEventListener('touchend', cancelEvent, {once: true}); // * fix instant closing
      }
    } : callback);
  }
};
