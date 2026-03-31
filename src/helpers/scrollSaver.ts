/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Scrollable from '@components/scrollable';
import type {ScrollableContextValue} from '@components/scrollable2';
import {MOUNT_CLASS_TO} from '@config/debug';
import {IS_SAFARI} from '@environment/userAgent';
import getVisibleRect from '@helpers/dom/getVisibleRect';
import {fastRaf} from '@helpers/schedulers';

// let USE_REFLOW = false;
// if(IS_SAFARI) {
//   try {
//     // throw '';
//     const match = navigator.userAgent.match(/Version\/(.+?) /);
//     USE_REFLOW = +match[1] < 15.4;
//   } catch(err) {
//     USE_REFLOW = true;
//   }
// }

export default class ScrollSaver {
  private scrollHeight: number;
  private scrollHeightMinusTop: number;
  private scrollTop: number;
  private scrolledToEnd: boolean;
  private clientHeight: number;
  private elements: {element: HTMLElement, rect: DOMRect}[];

  /**
   *
   * @param scrollable to reset scroll position and direction
   * @param reverse true means top
   */
  constructor(
    private scrollable: Scrollable | ScrollableContextValue,
    private query: string,
    private reverse: boolean
  ) {

  }

  private get container() {
    return this.scrollable.container;
  }

  public getSaved() {
    return {
      scrollHeight: this.scrollHeight,
      scrollTop: this.scrollTop,
      clientHeight: this.clientHeight
    };
  }

  public findElements() {
    if(!this.query) return [];

    const {container} = this;
    const containerRect = container.getBoundingClientRect();
    const bubbles = Array.from(container.querySelectorAll(this.query)) as HTMLElement[];
    const elements: ScrollSaver['elements'] = [];
    for(const bubble of bubbles) {
      const elementRect = bubble.getBoundingClientRect();
      const visibleRect = getVisibleRect(bubble, container, undefined, elementRect, containerRect);
      if(visibleRect) {
        elements.push({element: bubble, rect: elementRect});
        // break; // find first
      } else if(elements.length) { // find last
        break;
      }
    }

    if(!elements.length) {
      const bubble = bubbles[0];
      if(bubble) {
        elements.push({element: bubble, rect: bubble.getBoundingClientRect()});
      }
    }

    return elements;
  }

  public replaceSaved(from: HTMLElement, to: HTMLElement) {
    if(!this.elements) {
      return;
    }

    const idx = this.elements.findIndex(({element}) => from === element);
    if(idx !== -1) {
      this.elements[idx].element = to;
    }
  }

  public findAndSetElements() {
    this.elements = this.findElements();
  }

  public save() {
    this.findAndSetElements();
    // console.warn('scroll save', this.elements);
    this._save();
  }

  public _save() {
    const {scrollTop, scrollHeight, clientHeight} = this.container;

    // previousScrollHeight = scrollHeight;
    // previousScrollHeight = scrollHeight + padding;
    this.scrollHeight = scrollHeight;
    this.scrollTop = scrollTop;
    this.clientHeight = clientHeight;
    this.scrollHeightMinusTop = this.reverse ? scrollHeight - scrollTop : scrollTop;
    this.scrolledToEnd = scrollHeight - Math.ceil(scrollTop + clientHeight) <= 1;
    // this.chatInner.style.paddingTop = padding + 'px';
    /* if(reverse) {
      previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
    } else {
      previousScrollHeightMinusTop = scrollTop;
    } */
  }

  private onRestore(useReflow?: boolean) {
    // if(USE_REFLOW && useReflow/*  && !isAppleMobile */) { // * fix blinking and jumping
    //   reflowScrollableElement(this.container);
    // }

    this.scrollable.onSizeChange();
  }

  private setScrollTop(newScrollTop: number, useReflow?: boolean) {
    // touchSupport for safari iOS
    // isTouchSupported && isApple && (container.container.style.overflow = 'hidden');
    this.scrollable.setScrollPositionSilently(this.scrollTop = newScrollTop);
    // container.scrollTop = scrollHeight;
    // isTouchSupported && isApple && (container.container.style.overflow = '');

    if(IS_SAFARI) {
      fastRaf(() => {
        if(this.scrollTop === newScrollTop) {
          this.scrollable.setScrollPositionSilently(this.scrollTop = newScrollTop);
        }
      });
    }

    this.onRestore(useReflow);
  }

  private getAnchor() {
    return this.elements[this.reverse ? 0 : this.elements.length - 1];
  }

  public restore(useReflow?: boolean) {
    const {scrollPosition: scrollTop, scrollSize: scrollHeight} = this.scrollable;
    this.scrollHeight = scrollHeight;

    if(!this.elements.length && this.query) { // maybe all messages have been deleted or adding first message
      // this._restore(useReflow);
      this.setScrollTop(this.reverse ? scrollHeight : 0, useReflow); // fix scrolling to first new message
      return;
    }

    let anchor: ScrollSaver['elements'][0];
    // for(let i = this.elements.length - 1; i >= 0; --i) {
    //   const _anchor = this.elements[i];
    //   if(_anchor.element.parentElement) {
    //     anchor = _anchor;
    //     break;
    //   }
    // }
    anchor = this.getAnchor();

    if(!anchor?.element?.parentElement) { // try to find new anchor
      this.findAndSetElements();
      anchor = this.getAnchor();

      if(!anchor) { // fallback to old method if smth is really strange
        this._restore(useReflow);
        return;
      }
    }

    const {element, rect} = anchor;
    const newRect = element.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const isOverflowingTop = rect.top < containerRect.top;
    const isOverflowingBottom = rect.bottom > containerRect.bottom;
    let positionKey: 'top' | 'bottom' = this.reverse ? 'top' : 'bottom';
    if( // * stick to one of the visible edges
      this.reverse ?
        isOverflowingTop && !isOverflowingBottom :
        isOverflowingBottom && !isOverflowingTop
    ) {
      positionKey = this.reverse ? 'bottom' : 'top';
    }
    const newPosition = newRect[positionKey];
    let position = rect[positionKey];
    const modifiedHeight = rect.height - newRect.height;
    if(isOverflowingTop && isOverflowingBottom && modifiedHeight > 0) { // * large quote collapsing
      position = containerRect[positionKey];
      // position = newRect[positionKey] - containerRect[positionKey];
      // position = (position + rect.height / 2) - (containerRect.height / 2);
    }
    if(
      newPosition === position &&
      // newRect.bottom === rect.bottom &&
      !this.scrolledToEnd
      /*  && modifiedHeight >= 0 */
    ) {
      // console.log('no need to scroll', rect, newRect);
      return; // no need to scroll
    }

    const posDiff = newPosition - position;
    const diff = posDiff/*  + (modifiedHeight > 0 ? modifiedHeight : -modifiedHeight) *//*  * (this.reverse ? -1 : 1) */;
    // console.log(rect, posDiff, diff, newRect);
    if(!Math.abs(diff)) {
      return;
    }
    this.setScrollTop(scrollTop + diff, useReflow);
    // if(diff) debugger;
    // console.warn('scroll restore', rect, diff, newRect);
  }

  public _restore(useReflow?: boolean) {
    const {scrollHeightMinusTop: previousScrollHeightMinusTop, scrollable} = this;
    // if(previousScrollHeightMinusTop === undefined) {
    //   throw new Error('scroll was not saved');
    // }

    // const scrollHeight = container.scrollHeight;
    const scrollHeight = this.scrollHeight;
    // if(scrollHeight === this.scrollHeight) {
    //   return;
    // }

    // this.scrollHeight = scrollHeight;

    /* const scrollHeight = container.scrollHeight;
    const addedHeight = scrollHeight - previousScrollHeight;

    this.chatInner.style.paddingTop = (10000 - addedHeight) + 'px'; */
    /* const scrollHeight = scrollHeight;
    const addedHeight = scrollHeight - previousScrollHeight;

    this.chatInner.style.paddingTop = (padding - addedHeight) + 'px';

    //const newScrollTop = reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
    const newScrollTop = reverse ? scrollHeight - addedHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
    this.log('performHistoryResult: will set scrollTop',
    previousScrollHeightMinusTop, scrollHeight,
    newScrollTop, container.container.clientHeight); */
    // const newScrollTop = reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
    const newScrollTop = this.reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;

    /* if(DEBUG) {
      this.log('performHistoryResult: will set up scrollTop:', newScrollTop, this.isHeavyAnimationInProgress);
    } */

    this.setScrollTop(newScrollTop, useReflow);

    /* if(DEBUG) {
      this.log('performHistoryResult: have set up scrollTop:', newScrollTop, container.scrollTop, container.scrollHeight, this.isHeavyAnimationInProgress);
    } */
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.ScrollSaver = ScrollSaver);
