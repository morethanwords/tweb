import { findUpTag, whichChild } from "../helpers/dom";
import Transition from "./transition";

export function horizontalMenu(tabs: HTMLElement, content: HTMLElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void, transitionTime = 250) {
  let prevId = -1;

  const selectTab = Transition(content, tabs || content.dataset.slider == 'tabs' ? 'tabs' : 'navigation', transitionTime, onTransitionEnd);

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

      prevId = id;
    });
  }
  
  return selectTab;
}