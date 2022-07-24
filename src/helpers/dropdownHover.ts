/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { attachClickEvent } from "./dom/clickEvent";
import findUpAsChild from "./dom/findUpAsChild";
import EventListenerBase from "./eventListenerBase";
import ListenerSetter from "./listenerSetter";
import IS_TOUCH_SUPPORTED from "../environment/touchSupport";
import safeAssign from "./object/safeAssign";

const KEEP_OPEN = false;
const TOGGLE_TIMEOUT = 200;
const ANIMATION_DURATION = 200;

export default class DropdownHover extends EventListenerBase<{
  open: () => Promise<any> | void,
  opened: () => any,
  close: () => any,
  closed: () => any
}> {
  protected element: HTMLElement;
  protected displayTimeout: number;
  protected forceClose = false;
  protected inited = false;

  constructor(options: {
    element: DropdownHover['element']
  }) {
    super(false);
    safeAssign(this, options);
  }

  public attachButtonListener(button: HTMLElement, listenerSetter: ListenerSetter) {
    let firstTime = true;
    if(IS_TOUCH_SUPPORTED) {
      attachClickEvent(button, () => {
        if(firstTime) {
          firstTime = false;
          this.toggle(true);
        } else {
          this.toggle();
        }
      }, {listenerSetter});
    } else {
      listenerSetter.add(button)('mouseover', (e) => {
        //console.log('onmouseover button');
        if(firstTime) {
          listenerSetter.add(button)('mouseout', (e) => {
            clearTimeout(this.displayTimeout);
            this.onMouseOut(e);
          });
          firstTime = false;
        }

        clearTimeout(this.displayTimeout);
        this.displayTimeout = window.setTimeout(() => {
          this.toggle(true);
        }, TOGGLE_TIMEOUT);
      });
    }
  }

  private onMouseOut = (e: MouseEvent) => {
    if(KEEP_OPEN || !this.isActive()) return;
    clearTimeout(this.displayTimeout);

    const toElement = (e as any).toElement as Element;
    if(toElement && findUpAsChild(toElement, this.element)) {
      return;
    }

    this.displayTimeout = window.setTimeout(() => {
      this.toggle(false);
    }, TOGGLE_TIMEOUT);
  };

  protected init() {
    if(!IS_TOUCH_SUPPORTED) {
      this.element.onmouseout = this.onMouseOut;
      this.element.onmouseover = (e) => {
        if(this.forceClose) {
          return;
        }

        //console.log('onmouseover element');
        clearTimeout(this.displayTimeout);
      };
    }
  }

  public toggle = async(enable?: boolean) => {
    //if(!this.element) return;
    const willBeActive = (!!this.element.style.display && enable === undefined) || enable;
    if(this.init) {
      if(willBeActive) {
        this.init();
        this.init = null;
      } else {
        return;
      }
    }

    if(willBeActive === this.isActive()) {
      return;
    }
    
    if((this.element.style.display && enable === undefined) || enable) {
      const res = this.dispatchResultableEvent('open');
      await Promise.all(res);

      this.element.style.display = '';
      void this.element.offsetLeft; // reflow
      this.element.classList.add('active');

      clearTimeout(this.displayTimeout);
      this.displayTimeout = window.setTimeout(() => {
        this.forceClose = false;
        this.dispatchEvent('opened');
      }, IS_TOUCH_SUPPORTED ? 0 : ANIMATION_DURATION);

      // ! can't use together with resizeObserver
      /* if(isTouchSupported) {
        const height = this.element.scrollHeight + appImManager.chat.input.inputContainer.scrollHeight - 10;
        console.log('[ESG]: toggle: enable height', height);
        appImManager.chat.bubbles.scrollable.scrollTop += height;
      } */

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    } else {
      this.dispatchEvent('close');

      this.element.classList.remove('active');

      clearTimeout(this.displayTimeout);
      this.displayTimeout = window.setTimeout(() => {
        this.element.style.display = 'none';
        this.forceClose = false;
        this.dispatchEvent('closed');
      }, IS_TOUCH_SUPPORTED ? 0 : ANIMATION_DURATION);

      /* if(isTouchSupported) {
        const scrollHeight = this.container.scrollHeight;
        if(scrollHeight) {
          const height = this.container.scrollHeight + appImManager.chat.input.inputContainer.scrollHeight - 10;
          appImManager.chat.bubbles.scrollable.scrollTop -= height;
        }
      } */

      /* if(touchSupport) {
        this.restoreScroll();
      } */
    }

    //animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
  };

  public isActive() {
    return this.element.classList.contains('active');
  }
}
