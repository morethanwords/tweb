import { findUpTag, whichChild } from "../helpers/dom";
import { TransitionSlider } from "./transition";
import { ScrollableX } from "./scrollable";
import rootScope from "../lib/rootScope";

export function horizontalMenu(tabs: HTMLElement, content: HTMLElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void, transitionTime = 250, scrollableX?: ScrollableX) {
  const selectTab = TransitionSlider(content, tabs || content.dataset.slider == 'tabs' ? 'tabs' : 'navigation', transitionTime, onTransitionEnd);

  if(tabs) {
    const proxy = new Proxy(selectTab, {
      apply: (target, that, args) => {
        const id = +args[0];
        const animate = args[1] !== undefined ? args[1] : true;
  
        const el = (tabs.querySelector(`[data-tab="${id}"]`) || tabs.children[id]) as HTMLElement;
        selectTarget(el, id, animate);
      }
    });

    const selectTarget = (target: HTMLElement, id: number, animate = true) => {
      const tabContent = content.children[id] as HTMLDivElement;

      if(onClick) onClick(id, tabContent);

      if(scrollableX) {
        scrollableX.scrollIntoView(target.parentElement.children[id] as HTMLElement, true, transitionTime);
      }

      if(!rootScope.settings.animationsEnabled) {
        animate = false;
      }

      if(target.classList.contains('active') || id === selectTab.prevId) {
        return false;
      }
      
      const prev = tabs.querySelector(tagName.toLowerCase() + '.active') as HTMLElement;
      prev && prev.classList.remove('active');

      // stripe from ZINCHUK
      if(useStripe && selectTab.prevId !== -1 && animate) {
        const indicator = target.querySelector('i')!;
        const currentIndicator = target.parentElement.children[selectTab.prevId].querySelector('i')!;
  
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
      selectTab(id, animate);
    };

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

      selectTarget(target, id);
    });

    return proxy;
  }
  
  return selectTab;
}