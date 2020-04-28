import { whichChild, findUpTag } from "../lib/utils";
import Config from "../lib/config";

let rippleClickID = 0;
export function ripple(elem: HTMLElement, callback: (id: number) => Promise<boolean | void> = () => Promise.resolve(), onEnd: (id: number) => void = null) {
  let r = document.createElement('div');
  r.classList.add('c-ripple');

  elem.append(r);

  elem.addEventListener('mousedown', (e) => {
    if(elem.dataset.ripple == '0') {
      return false;
    }

    let startTime = Date.now();
    let span = document.createElement('span');

    let clickID = rippleClickID++;

    console.log('ripple mousedown');

    let handler = () => {
      let elapsedTime = Date.now() - startTime;
      if(elapsedTime < 700) {
        let delay = Math.max(700 - elapsedTime, 350);
        setTimeout(() => span.classList.add('hiding'), Math.max(delay - 350, 0));

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
        }, 350);
      }
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

        let clickX = e.clientX - rect.left;
        let clickY = e.clientY - rect.top;

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
    
    window.addEventListener('mouseup', () => {
      //console.time('appImManager: pre render start');
      handler();
    }, {once: true});
  });
}

let loadedURLs: {[url: string]: boolean} = {};
let set = (elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLSourceElement, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLSourceElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

export function renderImageFromUrl(elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLSourceElement, url: string) {
  if(loadedURLs[url]) return set(elem, url);

  if(elem instanceof HTMLSourceElement) {
    return elem.src = url;
  } else {
    let loader = new Image();
    loader.src = url;
    loader.onload = () => {
      set(elem, url);
      loadedURLs[url] = true;
    };
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

export function horizontalMenu(tabs: HTMLElement, content: HTMLDivElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void, transitionTime = 300) {
  let hideTimeout: number = 0;
  let prevTabContent: HTMLDivElement = null;
  
  let prevId = -1;
  let children = Array.from(content.children);
  let tabsChildren = tabs ? Array.from(tabs.firstElementChild.children) : [];
  let activeInSlide: Set<Element> = new Set();

  let selectTab = async(id: number) => {
    if(id == prevId) return false;

    let p = prevTabContent;

    /* children.forEach(child => {
      if(child != p) {
        child.classList.remove('active');
      }
    }); */

    let tabContent = content.children[id] as HTMLDivElement;
    tabContent.classList.add('active');

    if(!activeInSlide.has(tabContent)) {
      activeInSlide.add(tabContent);
    }

    //content.style.marginLeft = id > 0 ? (-id * 100) + '%' : '';
    let toRight = prevId < id;
    if(prevId != -1) {
      //content.classList.remove('animated');
      await new Promise((resolve) => window.requestAnimationFrame(() => {
        content.style.cssText = `will-change: width, transform; width: ${activeInSlide.size * 100}%; transform: translateX(-${100 - 100 / activeInSlide.size}%);`;

        content.classList.remove('animated');
        if(toRight) {
          content.classList.add('animated');
        } else {
          window.requestAnimationFrame(() => {
            content.classList.add('animated');
            content.style.transform = '';
          });
        }

        resolve();
      }));

      /* content.style.cssText = `will-change: width, transform; width: ${activeInSlide.size * 100}%; transform: translateX(-${100 - 100 / activeInSlide.size}%);`;

      content.classList.remove('animated');
      if(toRight) {
        content.classList.add('animated');
      } else {
        window.requestAnimationFrame(() => {
          content.classList.add('animated');
          content.style.transform = '';
        });
      } */
    }
    
    if(hideTimeout) clearTimeout(hideTimeout);
    if(p/*  && false */) {
      //if(tabs) tabs.classList.add('disable-hover');

      if(tabs) {
        tabsChildren.forEach((c, idx) => {
          if(idx != prevId && idx != id) {
            (c as HTMLElement).dataset.ripple = '0';
          }
        });
      }

      hideTimeout = setTimeout(() => {
        children.forEach(child => {
          if(child != tabContent) {
            child.classList.remove('active');
            activeInSlide.delete(child);
          }
        });

        if(tabs) {
          tabsChildren.forEach(c => {
            delete (c as HTMLElement).dataset.ripple;
          });
        }
  
        content.classList.remove('animated');
        content.style.cssText = '';
    
        hideTimeout = 0;
        
        if(onTransitionEnd) onTransitionEnd();
        //if(tabs) tabs.classList.remove('disable-hover');
      }, transitionTime);
    } 
    
    prevId = id;
    prevTabContent = tabContent;
  };

  if(tabs) {
    let activeStripe = document.createElement('span');
    activeStripe.classList.add('menu-horizontal__stripe');

    tabs.append(activeStripe);

    tabs.addEventListener('click', function(e) {
      let target = e.target as HTMLLIElement;
      
      if(target.tagName != 'LI') {
        target = findUpTag(target, 'LI');
      }
      
      //console.log('tabs click:', target);
      
      if(!target) return false;

      let id = whichChild(target);
      let tabContent = content.children[id] as HTMLDivElement;

      if(activeInSlide.size >= 2 && !activeInSlide.has(tabContent)) {
        return false;
      }

      if(onClick) onClick(id, tabContent);
      if(target.classList.contains('active') || id == prevId) {
        return false;
      }
      
      let prev = tabs.querySelector('li.active') as HTMLLIElement;
      prev && prev.classList.remove('active');

      let tabsRect = tabs.getBoundingClientRect();
      let textRect = target.firstElementChild.getBoundingClientRect();
      activeStripe.style.cssText = `width: ${textRect.width + (2 * 2)}px; transform: translateX(${textRect.left - tabsRect.left}px);`;
      //activeStripe.style.transform = `scaleX(${textRect.width}) translateX(${(textRect.left - tabsRect.left) / textRect.width + 0.5}px)`;
      console.log('tabs click:', tabsRect, textRect);

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
    
    if(country.pattern) {
      str = str.slice(0, country.pattern.length);
    }
  }
  
  return {formatted: str, country};
}

let onMouseMove = (e: MouseEvent) => {
  let rect = openedMenu.getBoundingClientRect();
  let {clientX, clientY} = e;
  
  let diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
  let diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;
  
  if(diffX >= 100 || diffY >= 100) {
    openedMenu.classList.remove('active');
    openedMenu.parentElement.classList.remove('menu-open');
    //openedMenu.parentElement.click();
  }
  //console.log('mousemove', diffX, diffY);
};

let openedMenu: HTMLDivElement = null;
export function openBtnMenu(menuElement: HTMLDivElement) {
  if(openedMenu) {
    openedMenu.classList.remove('active');
    openedMenu.parentElement.classList.remove('menu-open');
  }
  
  openedMenu = menuElement;
  openedMenu.classList.add('active');
  openedMenu.parentElement.classList.add('menu-open');
  
  window.addEventListener('click', () => {
    if(openedMenu) {
      openedMenu.parentElement.classList.remove('menu-open');
      openedMenu.classList.remove('active');
      openedMenu = null;
    }
    
    window.removeEventListener('mousemove', onMouseMove);
  }, {once: true});
  
  window.addEventListener('mousemove', onMouseMove);
}
