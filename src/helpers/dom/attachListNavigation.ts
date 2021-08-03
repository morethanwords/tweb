/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import fastSmoothScroll from "../fastSmoothScroll";
import { cancelEvent } from "./cancelEvent";
import { attachClickEvent, detachClickEvent } from "./clickEvent";
import findUpAsChild from "./findUpAsChild";
import findUpClassName from "./findUpClassName";

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const HANDLE_EVENT = 'keydown';
const ACTIVE_CLASS_NAME = 'active';

const AXIS_Y_KEYS: ArrowKey[] = ['ArrowUp', 'ArrowDown'];
const AXIS_X_KEYS: ArrowKey[] = ['ArrowLeft', 'ArrowRight'];

export default function attachListNavigation({list, type, onSelect, once, waitForKey}: {
  list: HTMLElement, 
  type: 'xy' | 'x' | 'y',
  onSelect: (target: Element) => void | boolean,
  once: boolean,
  waitForKey?: string
}) {
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
      fastSmoothScroll(scrollable, target as HTMLElement, 'center', undefined, undefined, undefined, 100, type === 'x' ? 'x' : 'y');
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
    if(!keyNames.has(e.key as any)) {
      if(e.key === 'Enter') {
        cancelEvent(e);
        fireSelect(getCurrentTarget());
      }

      return;
    }

    cancelEvent(e);

    if(list.childElementCount > 1) {
      let currentTarget = getCurrentTarget();
      currentTarget = handleArrowKey(currentTarget, e.key as any);
      setCurrentTarget(currentTarget, true);
    }
  };

  const scrollable = findUpClassName(list, 'scrollable');
  list.classList.add('navigable-list');

  const onMouseMove = (e: MouseEvent) => {
    const target = findUpAsChild(e.target, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
  };

  const onClick = (e: Event) => {
    cancelEvent(e); // cancel keyboard closening

    const target = findUpAsChild(e.target, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
    fireSelect(getCurrentTarget());
  };

  const fireSelect = (target: Element) => {
    const canContinue = onSelect(target);
    if(canContinue !== undefined ? !canContinue : once) {
      detach();
    }
  };

  const detach = () => {
    // input.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    document.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    list.removeEventListener('mousemove', onMouseMove);
    detachClickEvent(list, onClick);
  };

  const resetTarget = () => {
    if(waitForKey) return;
    setCurrentTarget(list.firstElementChild, false);
  };

  if(waitForKey) {
    const _onKeyDown = onKeyDown;
    onKeyDown = (e) => {
      if(e.key === waitForKey) {
        cancelEvent(e);

        document.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
        onKeyDown = _onKeyDown;
        document.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});

        waitForKey = undefined;
        resetTarget();
      }
    };
  } else {
    resetTarget();
  }

  // const input = document.activeElement as HTMLElement;
  // input.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});
  document.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});
  list.addEventListener('mousemove', onMouseMove, {passive: true});
  attachClickEvent(list, onClick);

  return {
    detach,
    resetTarget
  };
}
