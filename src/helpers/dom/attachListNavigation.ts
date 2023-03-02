/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import fastSmoothScroll from '../fastSmoothScroll';
import cancelEvent from './cancelEvent';
import {attachClickEvent} from './clickEvent';
import findUpAsChild from './findUpAsChild';
import findUpClassName from './findUpClassName';

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const HANDLE_EVENT = 'keydown';
const ACTIVE_CLASS_NAME = 'active';

const AXIS_Y_KEYS: ArrowKey[] = ['ArrowUp', 'ArrowDown'];
const AXIS_X_KEYS: ArrowKey[] = ['ArrowLeft', 'ArrowRight'];

export type ListNavigationOptions = {
  list: HTMLElement,
  type: 'xy' | 'x' | 'y',
  onSelect: (target: Element) => void | boolean | Promise<boolean>,
  once: boolean,
  waitForKey?: string[]
};

export default function attachListNavigation({list, type, onSelect, once, waitForKey}: ListNavigationOptions) {
  let waitForKeySet = waitForKey?.length ? new Set(waitForKey) : undefined;
  const keyNames = new Set(type === 'xy' ? AXIS_Y_KEYS.concat(AXIS_X_KEYS) : (type === 'x' ? AXIS_X_KEYS : AXIS_Y_KEYS));

  let target: Element;
  const getCurrentTarget = () => {
    return target || list.querySelector('.' + ACTIVE_CLASS_NAME) || list.firstElementChild;
  };

  const setCurrentTarget = (_target: Element, scrollTo: boolean) => {
    if(target === _target) {
      return;
    }

    let hadTarget = false;
    if(target) {
      hadTarget = true;
      target.classList.remove(ACTIVE_CLASS_NAME);
    }

    target = _target;
    if(!target) return;
    target.classList.add(ACTIVE_CLASS_NAME);

    if(hadTarget && scrollable && scrollTo) {
      fastSmoothScroll({
        container: scrollable,
        element: target as HTMLElement,
        position: 'center',
        forceDuration: 100,
        axis: type === 'x' ? 'x' : 'y'
      });
    }
  };

  const getNextTargetX = (currentTarget: Element, isNext: boolean) => {
    let nextTarget: Element;
    if(isNext) nextTarget = currentTarget.nextElementSibling || list.firstElementChild;
    else nextTarget = currentTarget.previousElementSibling || list.lastElementChild;

    return nextTarget;
  };

  const getNextTargetY = (currentTarget: Element, isNext: boolean) => {
    const property = isNext ? 'nextElementSibling' : 'previousElementSibling';
    const endProperty = isNext ? 'firstElementChild' : 'lastElementChild';
    const currentRect = currentTarget.getBoundingClientRect();

    let nextTarget = currentTarget[property] || list[endProperty];
    while(nextTarget !== currentTarget) {
      const targetRect = nextTarget.getBoundingClientRect();
      if(targetRect.x === currentRect.x && targetRect.y !== currentRect.y) {
        break;
      }

      nextTarget = nextTarget[property] || list[endProperty];
    }

    return nextTarget;
  };

  let handleArrowKey: (currentTarget: Element, key: ArrowKey) => Element;
  if(type === 'xy') { // flex-direction: row; flex-wrap: wrap;
    handleArrowKey = (currentTarget, key) => {
      if(key === 'ArrowUp' || key === 'ArrowDown') return getNextTargetY(currentTarget, key === 'ArrowDown');
      else return getNextTargetX(currentTarget, key === 'ArrowRight');
    };
  } else { // flex-direction: row | column;
    handleArrowKey = (currentTarget, key) => getNextTargetX(currentTarget, key === 'ArrowRight' || key === 'ArrowDown');
  }

  let onKeyDown = (e: KeyboardEvent) => {
    const key = e.key;
    if(!keyNames.has(key as any)) {
      if(key === 'Enter' || (type !== 'xy' && key === 'Tab')) {
        cancelEvent(e);
        fireSelect(getCurrentTarget());
      }

      return;
    }

    cancelEvent(e);

    if(list.childElementCount > 1) {
      let currentTarget = getCurrentTarget();
      currentTarget = handleArrowKey(currentTarget, key as any);
      setCurrentTarget(currentTarget, true);
    }
  };

  const scrollable = findUpClassName(list, 'scrollable');
  list.classList.add('navigable-list');

  const onMouseMove = (e: MouseEvent) => {
    const target = findUpAsChild(e.target as HTMLElement, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
  };

  const onClick = (e: Event) => {
    cancelEvent(e); // cancel keyboard closening

    const target = findUpAsChild(e.target as HTMLElement, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
    fireSelect(getCurrentTarget());
  };

  const fireSelect = async(target: Element) => {
    const canContinue = await onSelect(target);
    if(canContinue !== undefined ? !canContinue : once) {
      detach();
    }
  };

  let attached = false, detachClickEvent: () => void;
  const attach = () => {
    if(attached) return;
    attached = true;
    // const input = document.activeElement as HTMLElement;
    // input.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});
    document.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});
    list.addEventListener('mousemove', onMouseMove, {passive: true});
    detachClickEvent = attachClickEvent(list, onClick);
  };

  const detach = () => {
    if(!attached) return;
    attached = false;
    // input.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    document.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    list.removeEventListener('mousemove', onMouseMove);
    detachClickEvent();
    detachClickEvent = undefined;
  };

  const resetTarget = () => {
    if(waitForKeySet) return;
    setCurrentTarget(list.firstElementChild, false);
  };

  if(waitForKeySet) {
    const _onKeyDown = onKeyDown;
    onKeyDown = (e) => {
      if(waitForKeySet.has(e.key)) {
        cancelEvent(e);

        document.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
        onKeyDown = _onKeyDown;
        document.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});

        waitForKeySet = undefined;
        resetTarget();
      }
    };
  } else {
    resetTarget();
  }

  attach();

  return {
    attach,
    detach,
    resetTarget
  };
}
