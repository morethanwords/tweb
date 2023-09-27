/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ScrollableBase} from '../../components/scrollable';
import SwipeHandler from '../../components/swipeHandler';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import rootScope from '../../lib/rootScope';
import liteMode from '../liteMode';
import {Middleware} from '../middleware';
import clamp from '../number/clamp';
import safeAssign from '../object/safeAssign';
import pause from '../schedulers/pause';
import cancelEvent from './cancelEvent';
import {attachClickEvent} from './clickEvent';
import findUpAsChild from './findUpAsChild';
import positionElementByIndex from './positionElementByIndex';
import whichChild from './whichChild';

export default class Sortable {
  private element: HTMLElement;
  private elementRect: DOMRect;
  private containerRect: DOMRect;
  private scrollableRect: DOMRect;
  private minY: number;
  private maxY: number;
  private siblings: HTMLElement[];
  private swipeHandler: SwipeHandler;
  private startScrollPos: number;
  private addScrollPos: number;

  private list: HTMLElement;
  private middleware: Middleware;
  private onSort: (prevIdx: number, newIdx: number) => void;
  private scrollable: ScrollableBase;

  constructor(options: {
    list: HTMLElement,
    middleware: Middleware,
    onSort: Sortable['onSort'],
    scrollable?: Sortable['scrollable']
  }) {
    safeAssign(this, options);

    this.swipeHandler = new SwipeHandler({
      element: this.list,
      onSwipe: this.onSwipe,
      verifyTouchTarget: this.verifyTouchTarget,
      onStart: this.onStart,
      onReset: this.onReset,
      setCursorTo: document.body,
      middleware: this.middleware,
      withDelay: true
    });
  }

  private onSwipe = (xDiff: number, yDiff: number) => {
    yDiff = clamp(yDiff, this.minY, this.maxY);
    this.element.style.transform = `translateY(${yDiff}px)`;
    const count = Math.round(Math.abs(yDiff) / this.elementRect.height);
    const lastSiblings = this.siblings;
    this.siblings = [];
    const property = yDiff < 0 ? 'previousElementSibling' : 'nextElementSibling';
    let sibling = this.element[property] as HTMLElement;
    for(let i = 0; i < count; ++i) {
      if(this.getSortableTarget(sibling)) {
        this.siblings.push(sibling);
        sibling = sibling[property] as HTMLElement;
      } else {
        break;
      }
    }

    (lastSiblings || []).forEach((sibling) => {
      if(!this.siblings.includes(sibling)) {
        sibling.style.transform = '';
      }
    });

    this.siblings.forEach((sibling) => {
      const y = this.elementRect.height * (yDiff < 0 ? 1 : -1);
      sibling.style.transform = `translateY(${y}px)`;
    });

    if(this.scrollableRect) {
      const diff = yDiff;
      const toEnd = diff > 0;
      const elementEndPos = toEnd ? this.elementRect.bottom : this.elementRect.top;
      const clientY = elementEndPos + diff - this.addScrollPos;
      // console.log(clientY, this.scrollableRect.top, elementEndPos, diff, this.addScrollPos, toEnd);
      let change = 2;
      if((clientY + (toEnd ? 0 : this.elementRect.height)) >= this.scrollableRect.bottom/*  && diff < this.maxY */) {

      } else if((clientY - (toEnd ? this.elementRect.height : 0)) <= this.scrollableRect.top/*  && diff > this.minY */) {
        change *= -1;
      } else {
        change = undefined;
      }

      if(change !== undefined) {
        this.scrollable.scrollPosition += change;
      }
    }
  };

  private verifyTouchTarget = (e: {target: EventTarget}) => {
    if(this.list.classList.contains('is-reordering')) {
      return false;
    }

    this.element = this.getSortableTarget(e.target as HTMLElement);
    return !!this.element/*  && pause(150).then(() => true) */;
  };

  private onScroll = () => {
    const scrollPos = this.scrollable.scrollPosition;
    const diff = this.addScrollPos = scrollPos - this.startScrollPos;
    const isVertical = this.scrollable.scrollPositionProperty === 'scrollTop';
    this.swipeHandler.add(isVertical ? 0 : diff, isVertical ? diff : 0);
  };

  private onStart = () => {
    this.list.classList.add('is-reordering');
    this.element.classList.add('is-dragging', 'no-transition');
    this.swipeHandler.setCursor('grabbing');
    this.elementRect = this.element.getBoundingClientRect();
    this.containerRect = this.list.getBoundingClientRect();

    this.minY = this.containerRect.top - this.elementRect.top;
    this.maxY = this.containerRect.bottom - this.elementRect.bottom;
    this.addScrollPos = 0;

    if(this.scrollable) {
      this.startScrollPos = this.scrollable.scrollPosition;
      this.scrollableRect = this.scrollable.container.getBoundingClientRect();
      this.scrollable.container.addEventListener('scroll', this.onScroll);
    }
  };

  private onReset = async() => {
    const length = this.siblings.length;
    const move = length && length * (this.siblings[0].previousElementSibling === this.element ? 1 : -1);
    const idx = whichChild(this.element);
    const newIdx = idx + move;

    this.element.classList.remove('no-transition');
    this.element.style.transform = move ? `translateY(${move * this.elementRect.height}px)` : '';
    this.swipeHandler.setCursor('');

    if(this.scrollable) {
      this.scrollable.container.removeEventListener('scroll', this.onScroll);
    }

    if(!IS_TOUCH_SUPPORTED) {
      attachClickEvent(document.body, cancelEvent, {capture: true, once: true});
    }

    if(liteMode.isAvailable('animations')) {
      await pause(250);
    }

    this.list.classList.remove('is-reordering');
    this.element.classList.remove('is-dragging');
    positionElementByIndex(this.element, this.list, newIdx, idx);
    [this.element, ...this.siblings].forEach((element) => {
      element.style.transform = '';
    });

    this.element =
      this.siblings =
      this.elementRect =
      this.containerRect =
      this.minY =
      this.maxY =
      this.startScrollPos =
      this.addScrollPos =
      undefined;

    // cancelClick = true;

    if(!move) {
      return;
    }

    this.onSort(idx, newIdx);
  };

  private getSortableTarget(target: HTMLElement) {
    if(!target) {
      return;
    }

    let child = findUpAsChild(target as HTMLElement, this.list);
    if(child && child.classList.contains('cant-sort')) {
      child = undefined;
    }

    return child;
  }
}
