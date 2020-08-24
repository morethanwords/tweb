import { findUpTag, whichChild } from "../lib/utils";

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