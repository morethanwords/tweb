import apiManager from "../lib/mtproto/apiManager";
import { whichChild, isElementInViewport, isInDOM, findUpTag } from "../lib/utils";

let onRippleClick = function(this: HTMLElement, e: MouseEvent) {
  var $circle = this.firstElementChild as HTMLSpanElement;//this.querySelector('.c-ripple__circle') as HTMLSpanElement;
  
  var rect = this.parentElement.getBoundingClientRect();
  var x = e.clientX - rect.left; //x position within the element.
  var y = e.clientY - rect.top;
  
  /* var x = e.pageX - this.parentElement.offsetLeft;
  var y = e.pageY - this.parentElement.offsetTop - this.parentElement.scrollHeight; */
  
  $circle.style.top = y + 'px';
  $circle.style.left = x + 'px';
  
  this.classList.add('active');
  
  //console.log('onrippleclick', e/* e.pageY, this.parentElement.offsetTop */);
};

export function ripple(elem: Element) {
  /* elem.addEventListener('click', function(e) {
    var $circle = elem.querySelector('.c-ripple__circle') as HTMLSpanElement;
    
    var x = e.pageX - elem.offsetLeft;
    var y = e.pageY - elem.offsetTop;
    
    $circle.style.top = y + 'px';
    $circle.style.left = x + 'px';
    
    elem.classList.add('active');
  }); */
  
  let r = document.createElement('div');
  r.classList.add('c-ripple');
  
  let span = document.createElement('span');
  span.classList.add('c-ripple__circle');
  
  r.append(span);
  elem.append(r);
  
  r.addEventListener('click', onRippleClick);
  
  let onEnd = () => {
    r.classList.remove('active');
  };
  
  for(let type of ['animationend', 'webkitAnimationEnd', 'oanimationend', 'MSAnimationEnd']) {
    r.addEventListener(type, onEnd);
  }
}

export function putPreloader(elem: Element) {
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;
  
  elem.innerHTML += html;
}

export function horizontalMenu(tabs: HTMLUListElement, content: HTMLDivElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void) {
  let hideTimeout: number = 0;
  let prevTabContent: HTMLDivElement = null;
  
  let prevId = -1;
  
  tabs.addEventListener('click', function(e) {
    let target = e.target as HTMLLIElement;
    
    if(target.tagName != 'LI') {
      target = findUpTag(target, 'LI');
    }
    
    ///////console.log('tabs click:', target);
    
    if(!target || target.classList.contains('active')) return false;
    
    let prev = tabs.querySelector('li.active') as HTMLLIElement;
    prev && prev.classList.remove('active');
    
    target.classList.add('active');
    
    let id = whichChild(target);
    
    if(id == prevId) return false;
    
    let tabContent = content.children[id] as HTMLDivElement;
    tabContent.classList.add('active');
    
    /////console.log('mambo rap', prevId, id);
    
    //content.style.marginLeft = id > 0 ? (-id * 100) + '%' : '';
    let toRight = prevId < id;
    if(prevId != -1) {
      content.style.width = '200%';
      
      //////console.log('mambo rap setting', toRight);
      
      content.classList.remove('animated');
      
      if(toRight) {
        content.classList.add('animated');
        content.style.marginLeft = '-100%';
      } else {
        
        content.style.marginLeft = '-100%';
        setTimeout(() => {
          content.classList.add('animated');
          content.style.marginLeft = '';
        }, 10);
      }
    }
    
    prevId = id;
    
    let p = prevTabContent;
    clearTimeout(hideTimeout);
    if(p) hideTimeout = setTimeout(() => {
      if(toRight) {
        p.classList.remove('active');
        content.classList.remove('animated');
        content.style.width = '100%'; 
      }
      
      /* content.style.marginLeft = '0%';
      content.style.width = '100%'; */
      
      if(!toRight) {
        p.classList.remove('active');
        content.classList.remove('animated');
        content.style.width = '100%';
      }
      
      content.style.marginLeft = '';
      
      if(onTransitionEnd) onTransitionEnd();
    }, 200);
    
    if(onClick) onClick(id, tabContent);
    prevTabContent = tabContent;
  });
}

export function getNearestDc() {
  return apiManager.invokeApi('help.getNearestDc').then((nearestDcResult: any) => {
    if(nearestDcResult.nearest_dc != nearestDcResult.this_dc) {
      //MTProto.apiManager.baseDcID = nearestDcResult.nearest_dc;
      apiManager.getNetworker(nearestDcResult.nearest_dc);
    }
    
    return nearestDcResult;
  });
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
