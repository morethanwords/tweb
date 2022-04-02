/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from "../components/scrollable";
import { IS_SAFARI } from "../environment/userAgent";
import reflowScrollableElement from "./dom/reflowScrollableElement";

export default class ScrollSaver {
  private scrollHeight: number;
  private scrollHeightMinusTop: number;
  private scrollTop: number;
  private clientHeight: number;

  /**
   * 
   * @param scrollable to reset scroll position and direction
   * @param reverse true means top
   */
  constructor(
    private scrollable: Scrollable, 
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

  public save() {
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

    /* if(DEBUG) {
      this.log('performHistoryResult: messagesQueueOnRender, scrollTop:', scrollTop, scrollHeight, previousScrollHeightMinusTop);
    } */
  }

  public restore(useReflow?: boolean) {
    const {container, scrollHeightMinusTop: previousScrollHeightMinusTop, scrollable} = this;
    if(previousScrollHeightMinusTop === undefined) {
      throw new Error('scroll was not saved');
    }

    const scrollHeight = container.scrollHeight;
    if(scrollHeight === this.scrollHeight) {
      return;
    }

    this.scrollHeight = scrollHeight;

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

    // touchSupport for safari iOS
    //isTouchSupported && isApple && (container.container.style.overflow = 'hidden');
    this.scrollable.setScrollTopSilently(this.scrollTop = newScrollTop);
    //container.scrollTop = scrollHeight;
    //isTouchSupported && isApple && (container.container.style.overflow = '');

    if(IS_SAFARI && useReflow/*  && !isAppleMobile */) { // * fix blinking and jumping
      reflowScrollableElement(container);
    }

    /* if(DEBUG) {
      this.log('performHistoryResult: have set up scrollTop:', newScrollTop, container.scrollTop, container.scrollHeight, this.isHeavyAnimationInProgress);
    } */

    return;
  }
}
