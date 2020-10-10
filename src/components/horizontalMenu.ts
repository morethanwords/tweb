import { findUpTag, whichChild } from "../lib/utils";

function slideNavigation(tabContent: HTMLElement, prevTabContent: HTMLElement, width: number, toRight: boolean) {
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.filter = `brightness(80%)`;
  elements[0].style.transform = `translate3d(${-width * .25}px, 0, 0)`;
  elements[1].style.transform = `translate3d(${width}px, 0, 0)`;
  
  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
  tabContent.style.filter = '';
}

function slideTabs(tabContent: HTMLElement, prevTabContent: HTMLElement, width: number, toRight: boolean) {
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.transform = `translate3d(${-width}px, 0, 0)`;
  elements[1].style.transform = `translate3d(${width}px, 0, 0)`;

  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
}

export function horizontalMenu(tabs: HTMLElement, content: HTMLElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void, transitionTime = 250) {
  const hideTimeouts: {[id: number]: number} = {};
  //const deferred: (() => void)[] = [];
  let transitionEndTimeout: number;
  let prevTabContent: HTMLElement = null;
  let prevId = -1;

  const selectTab = (id: number, animate = true) => {
    if(id == prevId) return false;

    //console.log('selectTab id:', id);

    const p = prevTabContent;
    const tabContent = content.children[id] as HTMLElement;

    // * means animation isn't needed
    if(content.dataset.slider == 'none' || !animate) {
      if(p) {
        p.classList.remove('active');  
      }

      tabContent.classList.add('active');

      prevId = id;
      prevTabContent = tabContent;

      if(onTransitionEnd) onTransitionEnd();
      return;
    }

    if(prevTabContent) {
      prevTabContent.classList.remove('to');
    }

    const toRight = prevId < id;
    if(!tabContent) {
      //prevTabContent.classList.remove('active');
    } else if(prevId != -1) {
      const width = prevTabContent.getBoundingClientRect().width;

      if(tabs || content.dataset.slider == 'tabs') {
        slideTabs(tabContent, prevTabContent, width, toRight);
      } else {
        slideNavigation(tabContent, prevTabContent, width, toRight);
      }

      tabContent.classList.add('to');
    } else {
      tabContent.classList.add('active');
    }
    
    const _prevId = prevId;
    if(hideTimeouts.hasOwnProperty(id)) clearTimeout(hideTimeouts[id]);
    if(p/*  && false */) {
      hideTimeouts[_prevId] = window.setTimeout(() => {
        p.style.transform = '';
        p.style.filter = '';
        p.classList.remove('active');

        if(tabContent) {
          tabContent.classList.remove('to');
        }

        delete hideTimeouts[_prevId];
      }, /* 420 */transitionTime);

      if(onTransitionEnd) {
        if(transitionEndTimeout) clearTimeout(transitionEndTimeout);
        transitionEndTimeout = window.setTimeout(() => {
          onTransitionEnd();
          transitionEndTimeout = 0;
        }, transitionTime);
      }
    }
    
    prevId = id;
    prevTabContent = tabContent;

    /* if(p) {
      return new Promise((resolve) => {
        deferred.push(resolve);
      });
    } else {
      return Promise.resolve();
    } */
  };

  if(tabs) {
    const useStripe = !tabs.classList.contains('no-stripe');

    const tagName = tabs.classList.contains('menu-horizontal-div') ? 'BUTTON' : 'LI';//tabs.firstElementChild.tagName;
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

      // stripe from ZINCHUK
      if(useStripe && prevId != -1) {
        const indicator = target.querySelector('i')!;
        const currentIndicator = target.parentElement.children[prevId].querySelector('i')!;
  
        currentIndicator.classList.remove('animate');
        indicator.classList.remove('animate');
  
        // We move and resize our indicator so it repeats the position and size of the previous one.
        const shiftLeft = currentIndicator.parentElement.parentElement.offsetLeft - indicator.parentElement.parentElement.offsetLeft;
        const scaleFactor = currentIndicator.clientWidth / indicator.clientWidth;
        indicator.style.transform = `translate3d(${shiftLeft}px, 0, 0) scale3d(${scaleFactor}, 1, 1)`;

        //console.log(`translate3d(${shiftLeft}px, 0, 0) scale3d(${scaleFactor}, 1, 1)`);
  
        requestAnimationFrame(() => {
          // Now we remove the transform to let it animate to its own position and size.
          indicator.classList.add('animate');
          indicator.style.transform = 'none';
        });
      }
      // stripe END

      target.classList.add('active');
      selectTab(id);
    });
  }
  
  return selectTab;
}