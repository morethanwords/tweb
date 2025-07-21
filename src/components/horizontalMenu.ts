/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import TransitionSlider from './transition';
import {ScrollableX} from './scrollable';
import rootScope from '../lib/rootScope';
import {fastRaf} from '../helpers/schedulers';
import {FocusDirection} from '../helpers/fastSmoothScroll';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import whichChild from '../helpers/dom/whichChild';
import ListenerSetter from '../helpers/listenerSetter';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import liteMode from '../helpers/liteMode';

type OnChangeArgs = {
  element: HTMLElement;
  active: boolean;
};

type Args = {
  tabs: HTMLElement;
  content: HTMLElement,
  onClick?: (id: number, tabContent: HTMLDivElement, animate: boolean) => void | boolean | Promise<void | boolean>;
  onTransitionEnd?: () => void;
  transitionTime?: number;
  scrollableX?: ScrollableX;
  listenerSetter?: ListenerSetter;
  onChange?: (args: OnChangeArgs) => void;
};

export function horizontalMenuObjArgs({tabs, content, onClick, onTransitionEnd, transitionTime, scrollableX, listenerSetter, onChange}: Args) {
  return horizontalMenu(tabs, content, onClick, onTransitionEnd, transitionTime, scrollableX, listenerSetter, onChange);
}

export function horizontalMenu(
  tabs: HTMLElement,
  content: HTMLElement,
  onClick?: (id: number, tabContent: HTMLDivElement, animate: boolean) => void | boolean | Promise<void | boolean>,
  onTransitionEnd?: () => void,
  transitionTime = 200,
  scrollableX?: ScrollableX,
  listenerSetter?: ListenerSetter,
  onChange?: (args: OnChangeArgs) => void
) {
  const selectTab = TransitionSlider({
    content,
    type: tabs || content.dataset.animation === 'tabs' ? 'tabs' : 'navigation',
    transitionTime,
    onTransitionEnd,
    listenerSetter
  });

  if(!tabs) {
    return selectTab;
  }

  const proxy = new Proxy(selectTab, {
    apply: (target, that, args) => {
      const animate = args[1] !== undefined ? args[1] : true;

      let id: number, el: HTMLElement;
      if(args[0] instanceof HTMLElement) {
        id = whichChild(args[0]);
        el = args[0];
      } else {
        id = +args[0];
        el = (tabs.querySelector(`[data-tab="${id}"]`) || tabs.children[id]) as HTMLElement;
      }

      selectTarget(el, id, animate);
    }
  });

  const selectTarget = async(target: HTMLElement, id: number, animate = true) => {
    const tabContent = content.children[id] as HTMLDivElement;

    if(onClick) {
      const result1 = onClick(id, tabContent, animate);
      const canChange = result1 instanceof Promise ? await result1 : result1;
      if(canChange !== undefined && !canChange) {
        return;
      }
    }

    if(scrollableX) {
      scrollableX.scrollIntoViewNew({
        element: target.parentElement.children[id] as HTMLElement,
        position: 'center',
        forceDirection: animate ? undefined : FocusDirection.Static,
        forceDuration: transitionTime,
        axis: 'x'
      });
    }

    if(!liteMode.isAvailable('animations')) {
      animate = false;
    }

    const prevId = selectTab.prevId();
    if(target.classList.contains('active') || id === prevId) {
      return false;
    }

    const mutateCallback = animate ? fastRaf : (cb: () => void) => cb();

    const prev = tabs.querySelector(tagName.toLowerCase() + '.active') as HTMLElement;
    if(prev) {
      mutateCallback(() => {
        prev.classList.remove('active');
        onChange?.({element: prev, active: false});
      });
    }

    // a great stripe from Jolly Cobra
    if(useStripe && prevId !== -1 && animate) {
      mutateCallback(() => {
        const indicator = target.querySelector('i')!;
        const currentIndicator = target.parentElement.children[prevId].querySelector('i')!;

        currentIndicator.classList.remove('animate');
        indicator.classList.remove('animate');

        // We move and resize our indicator so it repeats the position and size of the previous one.
        const shiftLeft = currentIndicator.parentElement.parentElement.offsetLeft - indicator.parentElement.parentElement.offsetLeft;
        const scaleFactor = currentIndicator.clientWidth / indicator.clientWidth;
        indicator.style.transform = `translate3d(${shiftLeft}px, 0, 0) scale3d(${scaleFactor}, 1, 1)`;

        // console.log(`translate3d(${shiftLeft}px, 0, 0) scale3d(${scaleFactor}, 1, 1)`);

        fastRaf(() => {
          // Now we remove the transform to let it animate to its own position and size.
          indicator.classList.add('animate');
          indicator.style.transform = 'none';
        });
      });
    }

    mutateCallback(() => {
      target.classList.add('active');
      onChange?.({element: target, active: true});
    });

    selectTab(id, animate);
  };

  const useStripe = !tabs.classList.contains('no-stripe');

  // const tagName = tabs.classList.contains('menu-horizontal-div') ? 'BUTTON' : 'LI';
  const tagName = tabs.firstElementChild.tagName;
  attachClickEvent(tabs, (e) => {
    let target = e.target as HTMLElement;

    target = findUpAsChild(target, tabs);

    // console.log('tabs click:', target);

    if(!target) return false;

    let id: number;
    if(target.dataset.tab) {
      id = +target.dataset.tab;
      if(id === -1) {
        return false;
      }
    } else {
      id = whichChild(target);
    }

    selectTarget(target, id);
  }, {listenerSetter});

  return proxy;
}
