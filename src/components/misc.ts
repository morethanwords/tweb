import { whichChild, findUpTag, cancelEvent, findUpClassName } from "../lib/utils";
import Config, { touchSupport, isApple, mediaSizes } from "../lib/config";

let rippleClickID = 0;
export function ripple(elem: HTMLElement, callback: (id: number) => Promise<boolean | void> = () => Promise.resolve(), onEnd: (id: number) => void = null) {
  //return;
  if(elem.querySelector('.c-ripple')) return;
  elem.classList.add('rp');
  
  let r = document.createElement('div');
  r.classList.add('c-ripple');

  const isSquare = elem.classList.contains('rp-square');
  if(isSquare) {
    r.classList.add('is-square');
  }

  const duration = isSquare ? 200 : 700;

  elem.append(r);

  let handler: () => void;
  let drawRipple = (clientX: number, clientY: number) => {
    let startTime = Date.now();
    let span = document.createElement('span');

    let clickID = rippleClickID++;

    //console.log('ripple drawRipple');

    handler = () => {
      let elapsedTime = Date.now() - startTime;
      if(elapsedTime < duration) {
        let delay = Math.max(duration - elapsedTime, duration / 2);
        setTimeout(() => span.classList.add('hiding'), Math.max(delay - duration / 2, 0));

        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          span.remove();
          if(onEnd) onEnd(clickID);
        }, delay);
      } else {
        span.classList.add('hiding');
        setTimeout(() => {
          //console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
          span.remove();
          if(onEnd) onEnd(clickID);
        }, duration / 2);
      }

      handler = null;
    };

    callback && callback(clickID);

    /* callback().then((bad) => {
      if(bad) {
        span.remove();
        return;
      } */
      
      //console.log('ripple after promise', Date.now() - startTime);
      //console.log('ripple tooSlow:', tooSlow);
      /* if(tooSlow) {
        span.remove();
        return;
      } */

      window.requestAnimationFrame(() => {
        span.classList.add('c-ripple__circle');
        let rect = r.getBoundingClientRect();

        let clickX = clientX - rect.left;
        let clickY = clientY - rect.top;

        let size: number, clickPos: number;
        if(rect.width > rect.height) {
          size = rect.width;
          clickPos = clickX;
        } else {
          size = rect.height;
          clickPos = clickY;
        }

        let offsetFromCenter = clickPos > (size / 2) ? size - clickPos : clickPos;
        size = size - offsetFromCenter;
        size *= 1.1;

        // center of circle
        let x = clickX - size / 2;
        let y = clickY - size / 2;

        //console.log('ripple click', offsetFromCenter, size, clickX, clickY);

        span.style.width = span.style.height = size + 'px';
        span.style.left = x + 'px';
        span.style.top = y + 'px';
  
        r.append(span);
        //r.classList.add('active');
        //handler();
      });
    //});
  };

  let touchStartFired = false;
  if(touchSupport) {
    let touchEnd = () => {
      handler && handler();
    };
  
    elem.addEventListener('touchstart', (e) => {
      //console.log('ripple touchstart', e);
      if(e.touches.length > 1 || ((e.target as HTMLElement).tagName == 'BUTTON' && e.target != elem)) {
        return;
      }
      
      //console.log('touchstart', e);
      touchStartFired = true;
  
      let {clientX, clientY} = e.touches[0];
      drawRipple(clientX, clientY);
      window.addEventListener('touchend', touchEnd, {once: true});
  
      window.addEventListener('touchmove', (e) => {
        e.cancelBubble = true;
        e.stopPropagation();
        handler && handler();
        window.removeEventListener('touchend', touchEnd);
      }, {once: true});
    }, {passive: true});
  } else {
    elem.addEventListener('mousedown', (e) => {
      if(elem.dataset.ripple == '0') {
        return false;
      } else if(touchStartFired) {
        touchStartFired = false;
        return false;
      }
  
      let {clientX, clientY} = e;
      drawRipple(clientX, clientY);
      window.addEventListener('mouseup', handler, {once: true});
    });
  }
}

const toastEl = document.createElement('div');
toastEl.classList.add('toast');
export function toast(html: string) {
  toastEl.innerHTML = html;
  document.body.append(toastEl);

  if(toastEl.dataset.timeout) clearTimeout(+toastEl.dataset.timeout);
  toastEl.dataset.timeout = '' + setTimeout(() => {
    toastEl.remove();
    delete toastEl.dataset.timeout;
  }, 3000);
}

let loadedURLs: {[url: string]: boolean} = {};
let set = (elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLSourceElement, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLSourceElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

export async function renderImageFromUrl(elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLSourceElement, url: string): Promise<boolean> {
  if(loadedURLs[url]) {
    set(elem, url);
  } else {
    if(elem instanceof HTMLSourceElement) {
      elem.src = url;
    } else {
      await new Promise((resolve, reject) => {
        let loader = new Image();
        loader.src = url;
        //let perf = performance.now();
        loader.addEventListener('load', () => {
          set(elem, url);
          loadedURLs[url] = true;
          //console.log('onload:', url, performance.now() - perf);
          resolve(false);
        });
        loader.addEventListener('error', reject);
      });
    }
  }

  return !!loadedURLs[url];
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

function slideNavigation(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  /* if(toRight) {
    //prevTabContent.style.filter = `brightness(80%)`;
    prevTabContent.style.transform = `translateX(-25%)`;
    tabContent.style.transform = `translateX(20%)`;
  } else {
    //tabContent.style.filter = `brightness(80%)`;
    tabContent.style.transform = `translateX(-25%)`;
    prevTabContent.style.transform = `translateX(20%)`;
  } */
  if(toRight) {
    prevTabContent.style.filter = `brightness(80%)`;
    prevTabContent.style.transform = `translateX(-25%)`;
    tabContent.style.transform = `translateX(100%)`;
  } else {
    tabContent.style.filter = `brightness(80%)`;
    tabContent.style.transform = `translateX(-25%)`;
    prevTabContent.style.transform = `translateX(100%)`;
  }
  
  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
  tabContent.style.filter = '';
}

function slideTabs(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  if(toRight) {
    tabContent.style.transform = `translateX(100%)`;
    prevTabContent.style.transform = `translateX(-100%)`;
  } else {
    tabContent.style.transform = `translateX(-100%)`;
    prevTabContent.style.transform = `translateX(100%)`;
  }

  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
}

export function horizontalMenu(tabs: HTMLElement, content: HTMLElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void, transitionTime = 300) {
  const hideTimeouts: {[id: number]: number} = {};
  let prevTabContent: HTMLElement = null;
  let prevId = -1;

  const selectTab = (id: number) => {
    if(id == prevId) return false;

    //console.log('selectTab id:', id);

    const p = prevTabContent;
    const tabContent = content.children[id] as HTMLElement;

    if(content.dataset.slider == 'none') {
      if(p) {
        p.classList.remove('active');  
      }

      tabContent.classList.add('active');

      prevId = id;
      prevTabContent = tabContent;

      if(onTransitionEnd) onTransitionEnd();
      return;
    }

    const toRight = prevId < id;
    if(prevId != -1) {
      if(tabs || content.dataset.slider == 'tabs') {
        slideTabs(tabContent, prevTabContent, toRight);
      } else {
        slideNavigation(tabContent, prevTabContent, toRight);
      }
    } else {
      tabContent.classList.add('active');
    }
    
    const _prevId = prevId;
    if(hideTimeouts.hasOwnProperty(id)) clearTimeout(hideTimeouts[id]);
    if(p/*  && false */) {
      hideTimeouts[_prevId] = setTimeout(() => {
        p.style.transform = '';
        p.style.filter = '';
        p.classList.remove('active');

        delete hideTimeouts[_prevId];
        
        if(onTransitionEnd) onTransitionEnd();
      }, /* 420 */transitionTime);
    } 
    
    prevId = id;
    prevTabContent = tabContent;
  };

  if(tabs) {
    let activeStripe: HTMLSpanElement;
    if(!tabs.classList.contains('no-stripe')) {
      activeStripe = document.createElement('span');
      activeStripe.classList.add('menu-horizontal__stripe');
  
      tabs.append(activeStripe);
    }

    const tagName = 'LI';//tabs.firstElementChild.tagName;
    tabs.addEventListener('click', function(e) {
      let target = e.target as HTMLElement;
      
      if(target.tagName != tagName) {
        target = findUpTag(target, tagName);
      }
      
      //console.log('tabs click:', target);
      
      if(!target) return false;

      let id: number;
      if(target.dataset.tab) {
        id = +target.dataset.tab;
        if(id == -1) {
          return false;
        }
      } else {
        id = whichChild(target);
      }

      const tabContent = content.children[id] as HTMLDivElement;

      if(onClick) onClick(id, tabContent);
      if(target.classList.contains('active') || id == prevId) {
        return false;
      }
      
      const prev = tabs.querySelector(tagName.toLowerCase() + '.active') as HTMLElement;
      prev && prev.classList.remove('active');

      if(activeStripe) {
        const tabsRect = tabs.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const width = 50;
        activeStripe.style.cssText = `width: ${width}px; transform: translateX(${targetRect.left - tabsRect.left + ((targetRect.width - width) / 2)}px);`;
        /* const textRect = target.firstElementChild.getBoundingClientRect();
        activeStripe.style.cssText = `width: ${textRect.width + (2 * 2)}px; transform: translateX(${textRect.left - tabsRect.left}px);`; */
        //activeStripe.style.transform = `scaleX(${textRect.width}) translateX(${(textRect.left - tabsRect.left) / textRect.width + 0.5}px)`;
        //console.log('tabs click:', tabsRect, textRect);
      }

      target.classList.add('active');
      selectTab(id);
    });
  }
  
  return selectTab;
}

export function formatPhoneNumber(str: string) {
  str = str.replace(/\D/g, '');
  let phoneCode = str.slice(0, 6);
  
  ////console.log('str', str, phoneCode);
  
  let sortedCountries = Config.Countries.slice().sort((a, b) => b.phoneCode.length - a.phoneCode.length);
  
  let country = sortedCountries.find((c) => {
    return c.phoneCode.split(' and ').find((c) => phoneCode.indexOf(c.replace(/\D/g, '')) == 0);
  });
  
  let pattern = country ? country.pattern || country.phoneCode : '';
  if(country) {
    pattern.split('').forEach((symbol, idx) => {
      if(symbol == ' ' && str[idx] != ' ' && str.length > idx) {
        str = str.slice(0, idx) + ' ' + str.slice(idx);
      }
    });
    
    /* if(country.pattern) {
      str = str.slice(0, country.pattern.length);
    } */
  }
  
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

let onClick = (e: MouseEvent | TouchEvent) => {
  /* if(touchSupport && e.type == 'touchstart') {
    const target = findUpClassName(e.target, 'btn-menu');
    if(!target) {
      window.addEventListener('touchend', (e) => {
        return cancelEvent(e);
      }, {once: true});
    }
  } *//*  else if(!touchSupport && e.type == 'mousedown') {
    const target = findUpClassName(e.target, 'btn-menu');
    if(!target) {
      closeBtnMenu();
      return cancelEvent(e);
    }
  } */
  
  //e.preventDefault();
  closeBtnMenu();
};

let closeBtnMenu = () => {
  if(openedMenu) {
    openedMenu.classList.remove('active');
    openedMenu.parentElement.classList.remove('menu-open');
    openedMenu = null;
  }
  
  if(openedMenuOnClose) {
    openedMenuOnClose();
    openedMenuOnClose = null;
  }

  //document.body.classList.remove('disable-hover');

  if(touchSupport) {
    window.removeEventListener('touchmove', onClick);
    //window.removeEventListener('touchstart', onClick);
  } else {
    window.removeEventListener('mousemove', onMouseMove);
    //window.removeEventListener('mousedown', onClick);
    //window.removeEventListener('click', onClick);
  }

  window.removeEventListener('click', onClick);
  window.removeEventListener('contextmenu', onClick);
};

let openedMenu: HTMLDivElement = null, openedMenuOnClose: () => void = null;
export function openBtnMenu(menuElement: HTMLDivElement, onClose?: () => void) {
  closeBtnMenu();
  
  openedMenu = menuElement;
  openedMenu.classList.add('active');
  openedMenu.parentElement.classList.add('menu-open');

  //document.body.classList.add('disable-hover');
  
  openedMenuOnClose = onClose;

  if(touchSupport) {
    window.addEventListener('touchmove', onClick, {once: true});
    //window.addEventListener('touchstart', onClick);
  } else {
    window.addEventListener('mousemove', onMouseMove);
    //window.addEventListener('mousedown', onClick);
    //window.addEventListener('click', onClick, {once: true});
  }
  
  window.addEventListener('click', onClick, {once: true});
  window.addEventListener('contextmenu', onClick, {once: true});
}

export function positionMenu({clientX, clientY}: {clientX: number, clientY: number}/* e: MouseEvent */, elem: HTMLElement, side?: 'left' | 'right') {
  //let {clientX, clientY} = e;

  let {scrollWidth, scrollHeight} = elem;
  let {innerWidth, innerHeight} = window;

  if(mediaSizes.isMobile) {
    side = undefined;
  }

  if(side === undefined) {
    if((clientX + scrollWidth) > innerWidth) {
      if((clientX - scrollWidth) < 0) {
        elem.style.left = (innerWidth - scrollWidth) + 'px';
      } else {
        side = 'right';
      }
    }
  }

  if(!side) {
    side = 'left';
  }

  elem.classList.remove('bottom-left', 'bottom-right');
  if(side !== undefined) {
    elem.style.left = (side == 'right' ? clientX - scrollWidth : clientX) + 'px';
    elem.classList.add(side == 'left' ? 'bottom-right' : 'bottom-left');
  }

  if((clientY + scrollHeight) > innerHeight) {
    elem.style.top = (innerHeight - scrollHeight) + 'px';
  } else {
    elem.style.top = clientY + 'px';
  }
}

export function attachContextMenuListener(element: HTMLElement, callback: (e: Touch | MouseEvent) => void) {
  if(isApple && touchSupport) {
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

      timeout = setTimeout(() => {
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
