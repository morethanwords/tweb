/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../lib/rootScope';
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import {dispatchHeavyAnimationEvent} from '../hooks/useHeavyAnimationCheck';
import whichChild from '../helpers/dom/whichChild';
import cancelEvent from '../helpers/dom/cancelEvent';
import ListenerSetter from '../helpers/listenerSetter';
import liteMode from '../helpers/liteMode';

const USE_3D = true;

function makeTranslate(x: number, y: number) {
  return USE_3D ? `translate3d(${x}px, ${y}px, 0)` : `translate(${x}px, ${y}px)`;
}

function makeTransitionFunction(options: TransitionFunction) {
  return options;
}

const slideNavigation = makeTransitionFunction({
  callback: (tabContent, prevTabContent, toRight) => {
    const width = prevTabContent.getBoundingClientRect().width;
    const elements = [tabContent, prevTabContent];
    if(toRight) elements.reverse();
    elements[0].style.filter = `brightness(80%)`;
    elements[0].style.transform = makeTranslate(-width * .25, 0);
    elements[1].style.transform = makeTranslate(width, 0);

    tabContent.classList.add('active');
    void tabContent.offsetWidth; // reflow

    tabContent.style.transform = '';
    tabContent.style.filter = '';

    return () => {
      prevTabContent.style.transform = prevTabContent.style.filter = '';
    };
  },
  animateFirst: false
});

const slideTabs = makeTransitionFunction({
  callback: (tabContent, prevTabContent, toRight) => {
    // Jolly Cobra's // Workaround for scrollable content flickering during animation.
    // const scrollableContainer = findUpClassName(tabContent, 'scrollable-y');
    // if(scrollableContainer && scrollableContainer.style.overflowY !== 'hidden') {
    //   // const scrollBarWidth = scrollableContainer.offsetWidth - scrollableContainer.clientWidth;
    //   scrollableContainer.style.overflowY = 'hidden';
    //   // scrollableContainer.style.paddingRight = `${scrollBarWidth}px`;
    //   // this.container.classList.add('sliding');
    // }

    // window.requestAnimationFrame(() => {
    const width = prevTabContent.getBoundingClientRect().width;
    /* tabContent.style.setProperty('--width', width + 'px');
      prevTabContent.style.setProperty('--width', width + 'px');

      tabContent.classList.add('active'); */
    // void tabContent.offsetWidth; // reflow
    const elements = [tabContent, prevTabContent];
    if(toRight) elements.reverse();
    elements[0].style.transform = makeTranslate(-width, 0);
    elements[1].style.transform = makeTranslate(width, 0);

    tabContent.classList.add('active');
    void tabContent.offsetWidth; // reflow

    tabContent.style.transform = '';
    // });

    return () => {
      prevTabContent.style.transform = '';

      // if(scrollableContainer) {
      //   // Jolly Cobra's // Workaround for scrollable content flickering during animation.
      //   if(isSafari) { // ! safari doesn't respect sticky header, so it flicks when overflow is changing
      //     scrollableContainer.style.display = 'none';
      //   }

      //   scrollableContainer.style.overflowY = '';

      //   if(isSafari) {
      //     void scrollableContainer.offsetLeft; // reflow
      //     scrollableContainer.style.display = '';
      //   }

      //   // scrollableContainer.style.paddingRight = '0';
      //   // this.container.classList.remove('sliding');
      // }
    };
  },
  animateFirst: false
});

const slideTopics = makeTransitionFunction({
  callback: (tabContent, prevTabContent) => {
    const rect = tabContent.getBoundingClientRect();
    const offsetX = rect.width - 80;

    tabContent.style.transform = `transformX(${offsetX}px)`;

    tabContent.classList.add('active');
    void tabContent.offsetWidth; // reflow

    tabContent.style.transform = '';

    return () => {};
  },
  animateFirst: true
});

const transitions: {[type in TransitionSliderType]?: TransitionFunction} = {
  navigation: slideNavigation,
  tabs: slideTabs
  // topics: slideTopics
};

type TransitionSliderType = 'tabs' | 'navigation' | 'zoom-fade' | 'slide-fade' | 'topics' | 'none'/*  | 'counter' */;

type TransitionSliderOptions = {
  content: HTMLElement,
  type: TransitionSliderType,
  transitionTime: number,
  onTransitionEnd?: (id: number) => void,
  isHeavy?: boolean,
  once?: boolean,
  withAnimationListener?: boolean,
  listenerSetter?: ListenerSetter,
  animateFirst?: boolean
};

type TransitionFunction = {
  callback: (tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) => () => void,
  animateFirst: boolean
};

const TransitionSlider = (options: TransitionSliderOptions) => {
  let {
    content,
    type,
    transitionTime,
    onTransitionEnd,
    isHeavy = true,
    once = false,
    withAnimationListener = true,
    listenerSetter,
    animateFirst = false
  } = options;

  const {callback: animationFunction, animateFirst: _animateFirst} = transitions[type] || {};
  content.dataset.animation = type;

  if(_animateFirst !== undefined) {
    animateFirst = _animateFirst;
  }

  const onTransitionEndCallbacks: Map<HTMLElement, Function> = new Map();
  let animationDeferred: CancellablePromise<void>;
  // let animationStarted = 0;
  let from: HTMLElement = null;

  if(withAnimationListener) {
    const listenerName = animationFunction ? 'transitionend' : 'animationend';

    const onEndEvent = (e: TransitionEvent | AnimationEvent) => {
      cancelEvent(e);

      if((e.target as HTMLElement).parentElement !== content) {
        return;
      }

      // console.log('Transition: transitionend', /* content, */ e, selectTab.prevId, performance.now() - animationStarted);

      const callback = onTransitionEndCallbacks.get(e.target as HTMLElement);
      callback?.();

      if(e.target !== from) {
        return;
      }

      if(!animationDeferred && isHeavy) return;

      if(animationDeferred) {
        animationDeferred.resolve();
        animationDeferred = undefined;
      }

      onTransitionEnd?.(selectTab.prevId());

      content.classList.remove('animating', 'backwards', 'disable-hover');

      if(once) {
        if(listenerSetter) listenerSetter.removeManual(content, listenerName, onEndEvent);
        else content.removeEventListener(listenerName, onEndEvent/* , {capture: false} */);
        from = animationDeferred = undefined;
        onTransitionEndCallbacks.clear();
      }
    };

    // TODO: check for transition type (transform, etc) using by animationFunction
    if(listenerSetter) listenerSetter.add(content)(listenerName, onEndEvent);
    else content.addEventListener(listenerName, onEndEvent/* , {passive: true, capture: false} */);
  }

  function selectTab(id: number | HTMLElement, animate = true, overrideFrom?: typeof from) {
    if(overrideFrom) {
      from = overrideFrom;
    }

    if(id instanceof HTMLElement) {
      id = whichChild(id);
    }

    const prevId = selectTab.prevId();
    if(id === prevId) return false;

    // console.log('selectTab id:', id);

    const to = content.children[id] as HTMLElement;

    if(!liteMode.isAvailable('animations') || (prevId === -1 && !animateFirst)) {
      animate = false;
    }

    if(!withAnimationListener) {
      const timeout = content.dataset.timeout;
      if(timeout !== undefined) {
        clearTimeout(+timeout);
      }

      delete content.dataset.timeout;
    }

    if(!animate) {
      if(from) from.classList.remove('active', 'to', 'from');
      else if(to) { // fix instant opening back from closed slider (e.g. instant closening and opening right sidebar)
        const callback = onTransitionEndCallbacks.get(to);
        callback?.();
      }

      if(to) {
        to.classList.remove('to', 'from');
        to.classList.add('active');
      }

      content.classList.remove('animating', 'backwards', 'disable-hover');

      from = to;

      onTransitionEnd?.(id);
      return;
    }

    if(!withAnimationListener) {
      content.dataset.timeout = '' + window.setTimeout(() => {
        to.classList.remove('to');
        from && from.classList.remove('from');
        content.classList.remove('animating', 'backwards', 'disable-hover');
        delete content.dataset.timeout;
      }, transitionTime);
    }

    if(from) {
      from.classList.remove('to');
      from.classList.add('from');
    }

    content.classList.add('animating'/* , 'disable-hover' */);
    const toRight = prevId < id;
    content.classList.toggle('backwards', !toRight);

    let onTransitionEndCallback: ReturnType<TransitionFunction['callback']>;
    if(!to) {
      // prevTabContent.classList.remove('active');
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
      const transitionTimeout = to.dataset.transitionTimeout;
      if(transitionTimeout) {
        clearTimeout(+transitionTimeout);
      }

      onTransitionEndCallbacks.set(to, () => {
        to.classList.remove('to');
        onTransitionEndCallbacks.delete(to);
      });
    }

    if(from/*  && false */) {
      let timeout: number;
      const _from = from;
      const callback = () => {
        clearTimeout(timeout);
        _from.classList.remove('active', 'from');

        onTransitionEndCallback?.();

        onTransitionEndCallbacks.delete(_from);
      };

      if(to) {
        timeout = window.setTimeout(callback, transitionTime + 100); // something happened to container
        onTransitionEndCallbacks.set(_from, callback);
      } else {
        timeout = window.setTimeout(callback, transitionTime);
        onTransitionEndCallbacks.set(_from, () => {
          clearTimeout(timeout);
          onTransitionEndCallbacks.delete(_from);
        });
      }

      _from.dataset.transitionTimeout = '' + timeout;

      if(isHeavy) {
        if(!animationDeferred) {
          animationDeferred = deferredPromise<void>();
          // animationStarted = performance.now();
        }

        dispatchHeavyAnimationEvent(animationDeferred, transitionTime * 2);
      }
    }

    from = to;
  }

  // selectTab.prevId = -1;
  selectTab.prevId = () => from ? whichChild(from) : -1;
  selectTab.getFrom = () => from;
  selectTab.setFrom = (_from: HTMLElement) => from = _from;

  return selectTab;
};

export default TransitionSlider;
