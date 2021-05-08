/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";
import { dispatchHeavyAnimationEvent } from "../hooks/useHeavyAnimationCheck";
import whichChild from "../helpers/dom/whichChild";

function slideNavigation(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  const width = prevTabContent.getBoundingClientRect().width;
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.filter = `brightness(80%)`;
  elements[0].style.transform = `translate3d(${-width * .25}px, 0, 0)`;
  elements[1].style.transform = `translate3d(${width}px, 0, 0)`;
  
  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
  tabContent.style.filter = '';

  return () => {
    prevTabContent.style.transform = prevTabContent.style.filter = '';
  };
}

function slideTabs(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  //window.requestAnimationFrame(() => {
    const width = prevTabContent.getBoundingClientRect().width;
    /* tabContent.style.setProperty('--width', width + 'px');
    prevTabContent.style.setProperty('--width', width + 'px');

    tabContent.classList.add('active'); */
    //void tabContent.offsetWidth; // reflow
    const elements = [tabContent, prevTabContent];
    if(toRight) elements.reverse();
    elements[0].style.transform = `translate3d(${-width}px, 0, 0)`;
    elements[1].style.transform = `translate3d(${width}px, 0, 0)`;
  
    tabContent.classList.add('active');
    void tabContent.offsetWidth; // reflow
  
    tabContent.style.transform = '';
  //});
  
  return () => {
    prevTabContent.style.transform = '';
  };
}

export const TransitionSlider = (content: HTMLElement, type: 'tabs' | 'navigation' | 'zoom-fade' | 'slide-fade' | 'none'/*  | 'counter' */, transitionTime: number, onTransitionEnd?: (id: number) => void, isHeavy = true) => {
  let animationFunction: TransitionFunction = null;

  switch(type) {
    case 'tabs':
      animationFunction = slideTabs;
      break;
    case 'navigation':
      animationFunction = slideNavigation;
      break;
    /* default:
      break; */
  }

  content.dataset.animation = type;
  
  return Transition(content, animationFunction, transitionTime, onTransitionEnd, isHeavy);
};

type TransitionFunction = (tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) => void | (() => void);

const Transition = (content: HTMLElement, animationFunction: TransitionFunction, transitionTime: number, onTransitionEnd?: (id: number) => void, isHeavy = true) => {
  const onTransitionEndCallbacks: Map<HTMLElement, Function> = new Map();
  let animationDeferred: CancellablePromise<void>;
  let animationStarted = 0;
  let from: HTMLElement = null;

  // TODO: check for transition type (transform, etc) using by animationFunction
  content.addEventListener(animationFunction ? 'transitionend' : 'animationend', (e) => {
    if((e.target as HTMLElement).parentElement !== content) {
      return;
    }
    
    //console.log('Transition: transitionend', /* content, */ e, selectTab.prevId, performance.now() - animationStarted);

    const callback = onTransitionEndCallbacks.get(e.target as HTMLElement);
    if(callback) callback();

    if(e.target !== from) {
      return;
    }

    if(!animationDeferred && isHeavy) return;

    if(animationDeferred) {
      animationDeferred.resolve();
      animationDeferred = undefined;
    }

    if(onTransitionEnd) {
      onTransitionEnd(selectTab.prevId());
    }

    content.classList.remove('animating', 'backwards', 'disable-hover');
  });

  function selectTab(id: number | HTMLElement, animate = true) {
    const self = selectTab;

    if(id instanceof HTMLElement) {
      id = whichChild(id);
    }
    
    const prevId = self.prevId();
    if(id === prevId) return false;

    //console.log('selectTab id:', id);

    const _from = from;
    const to = content.children[id] as HTMLElement;

    if(!rootScope.settings.animationsEnabled || prevId === -1) {
      animate = false;
    }

    if(!animate) {
      if(_from) _from.classList.remove('active', 'to', 'from');  
      if(to) {
        to.classList.remove('to', 'from');
        to.classList.add('active');
      }

      content.classList.remove('animating', 'backwards', 'disable-hover');

      from = to;

      if(onTransitionEnd) onTransitionEnd(id);
      return;
    }

    if(from) {
      from.classList.remove('to');
      from.classList.add('from');
    }

    content.classList.add('animating', 'disable-hover');
    const toRight = prevId < id;
    content.classList.toggle('backwards', !toRight);

    let onTransitionEndCallback: ReturnType<TransitionFunction>;
    if(!to) {
      //prevTabContent.classList.remove('active');
    } else {
      if(animationFunction) {
        onTransitionEndCallback = animationFunction(to, from, toRight);
      } else {
        to.classList.add('active');
      }

      to.classList.remove('from');
      to.classList.add('to');
    }
    
    if(to) {
      onTransitionEndCallbacks.set(to, () => {
        to.classList.remove('to');
        onTransitionEndCallbacks.delete(to);
      });
    }

    if(_from/*  && false */) {
      const callback = () => {
        _from.classList.remove('active', 'from');

        if(onTransitionEndCallback) {
          onTransitionEndCallback();
        }

        onTransitionEndCallbacks.delete(_from);
      };

      if(to) {
        onTransitionEndCallbacks.set(_from, callback);
      } else {
        const timeout = window.setTimeout(callback, transitionTime);
        onTransitionEndCallbacks.set(_from, () => {
          clearTimeout(timeout);
        });
      }

      if(isHeavy) {
        if(!animationDeferred) {
          animationDeferred = deferredPromise<void>();
          animationStarted = performance.now();
        }
  
        dispatchHeavyAnimationEvent(animationDeferred, transitionTime * 2);
      }
    }
    
    from = to;
  }

  //selectTab.prevId = -1;
  selectTab.prevId = () => from ? whichChild(from) : -1;
  
  return selectTab;
};

export default Transition;