/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from "../components/scrollable";
import { MOUNT_CLASS_TO } from "../config/debug";
import { IS_SAFARI } from "../environment/userAgent";
import getVisibleRect from "./dom/getVisibleRect";
import reflowScrollableElement from "./dom/reflowScrollableElement";

export default class ScrollSaver {
  private scrollHeight: number;
  private scrollHeightMinusTop: number;
  private scrollTop: number;
  private clientHeight: number;
  private anchor: HTMLElement;
  private rect: DOMRect;

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

  public findAnchor() {
    const {container} = this;
    const containerRect = container.getBoundingClientRect();
    const bubbles = Array.from(container.querySelectorAll(this.query)) as HTMLElement[];
    let rect: DOMRect, anchor: HTMLElement;
    for(const bubble of bubbles) {
      const elementRect = bubble.getBoundingClientRect();
      const visibleRect = getVisibleRect(bubble, container, undefined, elementRect, containerRect);
      if(visibleRect) {
        rect = elementRect;
        anchor = bubble;
        // break; // find first
      } else if(anchor) { // find last
        break;
      }
    }

    if(!rect) {
      const bubble = bubbles[0];
      if(bubble) {
        rect = bubble.getBoundingClientRect();
        anchor = bubble;
      }
    }

    return {rect, anchor};
  }

  public findAndSetAnchor() {
    const {rect, anchor} = this.findAnchor();
    this.rect = rect;
    this.anchor = anchor;
  }

  public save() {
    this.findAndSetAnchor();
    // console.warn('scroll save', this.anchor, this.rect);
    this._save();
  }

  public _save() {
    const {scrollTop, scrollHeight, clientHeight} = this.container;

    //previousScrollHeight = scrollHeight;
    //previousScrollHeight = scrollHeight + padding;
    this.scrollHeight = scrollHeight;
    this.scrollTop = scrollTop;
    this.clientHeight = clientHeight;
    this.scrollHeightMinusTop = this.reverse ? scrollHeight - scrollTop : scrollTop;

    //this.chatInner.style.paddingTop = padding + 'px';
    /* if(reverse) {
      previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
    } else {
      previousScrollHeightMinusTop = scrollTop;
    } */
  }

  private onRestore(useReflow?: boolean) {
    if(IS_SAFARI && useReflow/*  && !isAppleMobile */) { // * fix blinking and jumping
      reflowScrollableElement(this.container);
    }
  }

  private setScrollTop(newScrollTop: number, useReflow?: boolean) {
    // touchSupport for safari iOS
    //isTouchSupported && isApple && (container.container.style.overflow = 'hidden');
    this.scrollable.setScrollTopSilently(this.scrollTop = newScrollTop);
    //container.scrollTop = scrollHeight;
    //isTouchSupported && isApple && (container.container.style.overflow = '');

    this.onRestore(useReflow);
  }

  public restore(useReflow?: boolean) {
    const {scrollTop, scrollHeight} = this.scrollable;
    this.scrollHeight = scrollHeight;

    if(!this.anchor?.parentElement) { // try to find new anchor
      this.findAndSetAnchor();

      if(!this.anchor) { // fallback to old method if smth is really strange
        this._restore(useReflow);
        return;
      }
    }

    const rect = this.rect;
    const newRect = this.anchor.getBoundingClientRect();
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
    //const newScrollTop = reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
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
