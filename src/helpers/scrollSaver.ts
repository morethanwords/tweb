/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from '../components/scrollable';
import {MOUNT_CLASS_TO} from '../config/debug';
import {IS_SAFARI} from '../environment/userAgent';
import getVisibleRect from './dom/getVisibleRect';
import reflowScrollableElement from './dom/reflowScrollableElement';

let USE_REFLOW = false;
if(IS_SAFARI) {
  try {
    // throw '';
    const match = navigator.userAgent.match(/Version\/(.+?) /);
    USE_REFLOW = +match[1] < 15.4;
  } catch(err) {
    USE_REFLOW = true;
  }
}

export default class ScrollSaver {
  private scrollHeight: number;
  private scrollHeightMinusTop: number;
  private scrollTop: number;
  private clientHeight: number;
  private elements: {element: HTMLElement, rect: DOMRect}[];

  /**
   *
   * @param scrollable to reset scroll position and direction
   * @param reverse true means top
   */
  constructor(
    private scrollable: Scrollable,
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

    // this.chatInner.style.paddingTop = padding + 'px';
    /* if(reverse) {
      previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
    } else {
      previousScrollHeightMinusTop = scrollTop;
    } */
  }

  private onRestore(useReflow?: boolean) {
    if(USE_REFLOW && useReflow/*  && !isAppleMobile */) { // * fix blinking and jumping
      reflowScrollableElement(this.container);
    }
  }

  private setScrollTop(newScrollTop: number, useReflow?: boolean) {
    // touchSupport for safari iOS
    // isTouchSupported && isApple && (container.container.style.overflow = 'hidden');
    this.scrollable.setScrollTopSilently(this.scrollTop = newScrollTop);
    // container.scrollTop = scrollHeight;
    // isTouchSupported && isApple && (container.container.style.overflow = '');

    this.onRestore(useReflow);
  }

  public restore(useReflow?: boolean) {
    const {scrollTop, scrollHeight} = this.scrollable;
    this.scrollHeight = scrollHeight;

    if(!this.elements.length) { // maybe all messages have been deleted
      this._restore(useReflow);
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
    anchor = this.elements[this.elements.length - 1];

    if(!anchor?.element?.parentElement) { // try to find new anchor
      this.findAndSetElements();
      anchor = this.elements[this.elements.length - 1];

      if(!anchor) { // fallback to old method if smth is really strange
        this._restore(useReflow);
        return;
      }
    }

    const {element, rect} = anchor;
    const newRect = element.getBoundingClientRect();
    const diff = newRect.bottom - rect.bottom;
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
