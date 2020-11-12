import Countries, { Country, PhoneCodesMain } from "../countries";
import { cancelEvent } from "../helpers/dom";
import mediaSizes from "../helpers/mediaSizes";
import { clamp } from "../helpers/number";
import { isTouchSupported } from "../helpers/touchSupport";
import { isApple } from "../helpers/userAgent";

export const loadedURLs: {[url: string]: boolean} = {};
const set = (elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLVideoElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

// проблема функции в том, что она не подходит для ссылок, пригодна только для blob'ов, потому что обычным ссылкам нужен 'load' каждый раз.
export function renderImageFromUrl(elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement, url: string, callback?: (err?: Event) => void): boolean {
  if((loadedURLs[url]/*  && false */) || elem instanceof HTMLVideoElement) {
    set(elem, url);
    callback && callback();
    return true;
  } else {
    const isImage = elem instanceof HTMLImageElement;
    const loader = isImage ? elem as HTMLImageElement : new Image();
    //const loader = new Image();
    loader.src = url;
    //let perf = performance.now();
    loader.addEventListener('load', () => {
      if(!isImage) {
        set(elem, url);
      }

      loadedURLs[url] = true;
      //console.log('onload:', url, performance.now() - perf);
      callback && callback();
    });

    if(callback) {
      loader.addEventListener('error', callback);
    }

    return false;
  }
}

export function putPreloader(elem: Element, returnDiv = false) {
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;

  if(returnDiv) {
    let div = document.createElement('div');
    div.classList.add('preloader');
    div.innerHTML = html;

    if(elem) {
      elem.appendChild(div);
    }

    return div;
  }
  
  elem.innerHTML += html;
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
    return c.phoneCode.split(' and ').find((c) => phoneCode.indexOf(c.replace(/\D/g, '')) == 0);
  });

  if(!country) return {formatted: str, country};

  country = PhoneCodesMain[country.phoneCode] || country;
  
  let pattern = country.pattern || country.phoneCode;
  pattern.split('').forEach((symbol, idx) => {
    if(symbol == ' ' && str[idx] != ' ' && str.length > idx) {
      str = str.slice(0, idx) + ' ' + str.slice(idx);
    }
  });
  
  /* if(country.pattern) {
    str = str.slice(0, country.pattern.length);
  } */
  
  return {formatted: str, country};
}

export function parseMenuButtonsTo(to: {[name: string]: HTMLElement}, elements: HTMLCollection | NodeListOf<HTMLElement>) {
  Array.from(elements).forEach(el => {
    const match = el.className.match(/(?:^|\s)menu-(.+?)(?:$|\s)/);
    if(!match) return;
    to[match[1]] = el as HTMLElement;
  });
}

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
  closeBtnMenu();
};

const onKeyDown = (e: KeyboardEvent) => {
  if(e.key == 'Escape') {
    closeBtnMenu();
    cancelEvent(e);
  }
};

export const closeBtnMenu = () => {
  if(openedMenu) {
    openedMenu.classList.remove('active');
    openedMenu.parentElement.classList.remove('menu-open');
    openedMenu.previousElementSibling.remove(); // remove overlay
    openedMenu = null;
  }
  
  if(openedMenuOnClose) {
    openedMenuOnClose();
    openedMenuOnClose = null;
  }

  if(isTouchSupported) {
    window.removeEventListener('touchmove', onClick);
  } else {
    window.removeEventListener('mousemove', onMouseMove);
  }

  window.removeEventListener('keydown', onKeyDown, {capture: true});
  window.removeEventListener('click', onClick);
  window.removeEventListener('contextmenu', onClick);
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

let openedMenu: HTMLElement = null, openedMenuOnClose: () => void = null;
export function openBtnMenu(menuElement: HTMLElement, onClose?: () => void) {
  closeBtnMenu();
  
  openedMenu = menuElement;
  openedMenu.classList.add('active');
  openedMenu.parentElement.classList.add('menu-open');

  const overlay = document.createElement('div');
  overlay.classList.add('btn-menu-overlay');
  openedMenu.parentElement.insertBefore(overlay, openedMenu);
  //document.body.classList.add('disable-hover');
  
  openedMenuOnClose = onClose;

  if(isTouchSupported) {
    window.addEventListener('touchmove', onClick, {once: true});
  } else {
    window.addEventListener('mousemove', onMouseMove);
  }
  
  window.addEventListener('keydown', onKeyDown, {capture: true});
  window.addEventListener('click', onClick, {once: true});
  window.addEventListener('contextmenu', onClick, {once: true});
}

const PADDING_TOP = 8;
const PADDING_LEFT = 8;
export function positionMenu({clientX, clientY}: {clientX: number, clientY: number}/* e: MouseEvent */, elem: HTMLElement, side?: 'left' | 'right') {
  //let {clientX, clientY} = e;

  let {scrollWidth, scrollHeight} = elem;
  let {innerWidth, innerHeight} = window;

  if(mediaSizes.isMobile) {
    side = undefined;
  }

  if(side === undefined) {
    if((clientX + scrollWidth + PADDING_LEFT) > innerWidth) {
      side = 'right';
    }
  }

  if(!side) {
    side = 'left';
  }

  // ! don't need reverse for this, this will be the side WHERE ANIMATION WILL END !
  // ! NO LOGIC HERE !
  let verticalSide: 'top' | 'bottom';

  if(side !== undefined) {
    let left: number;
    if(side === 'right') {
      left = clientX - scrollWidth;
      if(left < PADDING_LEFT) {
        side = 'left';
        left = Math.max(PADDING_LEFT, clientX);
      }
    } else {
      left = Math.max(PADDING_LEFT, clientX);
      if((clientX + scrollWidth) > (innerWidth - PADDING_LEFT)) {
        side = 'right';
        left = Math.max(clientX - scrollWidth, scrollWidth - PADDING_LEFT);
      }
    }

    //const left = clamp(side == 'right' ? clientX - scrollWidth : clientX, PADDING_LEFT, innerWidth - scrollWidth - PADDING_LEFT);
    elem.style.left = left + 'px';
  }
  
  if((clientY + scrollHeight + PADDING_TOP) > innerHeight) {
    elem.style.top = clamp(clientY - scrollHeight, PADDING_TOP, innerHeight - scrollHeight - PADDING_TOP) + 'px';
    // elem.style.top = (innerHeight - scrollHeight - PADDING_TOP) + 'px';
    verticalSide = 'top';
  } else {
    elem.style.top = Math.max(PADDING_TOP, clientY) + 'px';
    verticalSide = 'bottom';
  }
  
  elem.classList.remove('bottom-left', 'bottom-right', 'top-left', 'top-right');
  elem.classList.add(verticalSide + '-' + (side == 'left' ? 'right' : 'left'));
}

export function attachContextMenuListener(element: HTMLElement, callback: (e: Touch | MouseEvent) => void) {
  if(isApple && isTouchSupported) {
    let timeout: number;

    const onCancel = () => {
      clearTimeout(timeout);
      element.removeEventListener('touchmove', onCancel);
      element.removeEventListener('touchend', onCancel);
      element.removeEventListener('touchcancel', onCancel);
    };

    element.addEventListener('touchstart', (e) => {
      if(e.touches.length > 1) {
        clearTimeout(timeout);
        return;
      }
  
      element.addEventListener('touchmove', onCancel, {once: true});
      element.addEventListener('touchend', onCancel, {once: true});
      element.addEventListener('touchcancel', onCancel, {once: true});
  
      /* let eee = (e: TouchEvent) => {
        const target = findUpClassName(e.target, 'btn-menu');
        if(!target) {
          closeBtnMenu();
          window.addEventListener('touchend', (e) => {
            return cancelEvent(e);
          }, {once: true});
        }
      }; */

      timeout = window.setTimeout(() => {
        callback(e.touches[0]);
        onCancel();

        /* window.requestAnimationFrame(() => {
          window.addEventListener('touchstart', eee);
          window.addEventListener('touchend', (e) => {
            window.removeEventListener('touchstart', eee);
          }, {once: true});
        }); */
      }, .4e3);
    });
  } else {
    element.addEventListener('contextmenu', callback);
  }
};
