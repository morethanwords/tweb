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

const PROPERTY_NEXT = 'nextElementSibling';
const PROPERTY_PREV = 'previousElementSibling';
const PROPERTY_FIRST = 'firstElementChild';
const PROPERTY_LAST = 'lastElementChild';

export type ListNavigationOptions = {
  list: HTMLElement,
  type: 'xy' | 'x' | 'y',
  onSelect: (target: Element) => void | boolean | Promise<boolean>,
  once?: boolean,
  waitForKey?: string[],
  activeClassName?: string,
  cancelMouseDown?: boolean,
  target?: Element
};

export default function attachListNavigation({
  list,
  type,
  onSelect,
  once,
  waitForKey,
  activeClassName = ACTIVE_CLASS_NAME,
  cancelMouseDown,
  target
}: ListNavigationOptions) {
  let waitForKeySet = waitForKey?.length ? new Set(waitForKey) : undefined;
  const keyNames = new Set(type === 'xy' ? AXIS_Y_KEYS.concat(AXIS_X_KEYS) : (type === 'x' ? AXIS_X_KEYS : AXIS_Y_KEYS));

  const getCurrentTarget = () => {
    return target || list.querySelector('.' + activeClassName) || list[PROPERTY_FIRST];
  };

  const setCurrentTarget = (_target: Element, scrollTo: boolean) => {
    if(target === _target) {
      return;
    }

    let hadTarget = false;
    if(target) {
      hadTarget = true;
      target.classList.remove(activeClassName);
    }

    target = _target;
    if(!target) return;
    target.classList.add(activeClassName);

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

  const getNextTargetX = (currentTarget: Element, isNext: boolean): Element => {
    let nextTarget: Element;
    if(isNext) nextTarget = currentTarget[PROPERTY_NEXT] || list[PROPERTY_FIRST];
    else nextTarget = currentTarget[PROPERTY_PREV] || list[PROPERTY_LAST];

    return nextTarget;
  };

  const getNextTargetY = (currentTarget: Element, isNext: boolean) => {
    const property = isNext ? PROPERTY_NEXT : PROPERTY_PREV;
    const endProperty = isNext ? PROPERTY_FIRST : PROPERTY_LAST;
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
    if(cancelMouseDown) list.addEventListener('mousedown', cancelEvent);
    detachClickEvent = attachClickEvent(list, onClick, {ignoreMove: cancelMouseDown});
  };

  const detach = () => {
    if(!attached) return;
    attached = false;
    // input.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    document.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    list.removeEventListener('mousemove', onMouseMove);
    if(cancelMouseDown) list.removeEventListener('mousedown', cancelEvent);
    detachClickEvent();
    detachClickEvent = undefined;
  };

  const resetTarget = () => {
    if(waitForKeySet) return;
    setCurrentTarget(list[PROPERTY_FIRST], false);
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
  } else if(!target) {
    resetTarget();
  }

  attach();

  return {
    attach,
    detach,
    resetTarget
  };
}
