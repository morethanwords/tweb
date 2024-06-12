/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from './dom/clickEvent';
import findUpAsChild from './dom/findUpAsChild';
import EventListenerBase from './eventListenerBase';
import ListenerSetter from './listenerSetter';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import safeAssign from './object/safeAssign';
import appNavigationController, {NavigationItem} from '../components/appNavigationController';
import findUpClassName from './dom/findUpClassName';
import rootScope from '../lib/rootScope';
import liteMode from './liteMode';

const KEEP_OPEN = false;
const TOGGLE_TIMEOUT = 200;
const ANIMATION_DURATION = 200;

export type IgnoreMouseOutType = 'click' | 'menu' | 'popup' | 'tooltip';
type DropdownHoverTimeoutType = 'toggle' | 'done';

export default class DropdownHover extends EventListenerBase<{
  open: () => Promise<any> | void,
  openAfterLayout: () => void,
  opened: () => any,
  close: () => any,
  closed: () => any
}> {
  protected element: HTMLElement;
  protected forceClose: boolean;
  protected inited: boolean;
  protected ignoreMouseOut: Set<IgnoreMouseOutType>;
  protected ignoreButtons: Set<HTMLElement>;
  protected navigationItem: NavigationItem;
  protected ignoreOutClickClassName: string;
  protected timeouts: {[type in DropdownHoverTimeoutType]?: number};
  protected detachClickEvent: () => void;

  constructor(options: {
    element: DropdownHover['element'],
    ignoreOutClickClassName?: string
  }) {
    super(false);
    safeAssign(this, options);
    this.forceClose = false;
    this.inited = false;
    this.ignoreMouseOut = new Set();
    this.ignoreButtons = new Set();
    this.timeouts = {};
  }

  public attachButtonListener(
    button: HTMLElement,
    listenerSetter: ListenerSetter
  ) {
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
        if(firstTime) {
          listenerSetter.add(button)('mouseout', (e) => {
            this.clearTimeout('toggle');
            this.onMouseOut(e);
          });
          firstTime = false;
        }

        this.setTimeout('toggle', () => {
          this.toggle(true);
        }, TOGGLE_TIMEOUT);
      });

      attachClickEvent(button, this.onButtonClick.bind(this, button), {listenerSetter});
    }
  }

  public onButtonClick = (button?: HTMLElement, e?: MouseEvent) => {
    const type: IgnoreMouseOutType = 'click';
    const ignore = !this.ignoreMouseOut.has(type);

    if(ignore && !this.ignoreMouseOut.size) {
      button && this.ignoreButtons.add(button);
      setTimeout(() => {
        this.detachClickEvent = attachClickEvent(window, this.onClickOut, {capture: true});
      }, 0);
    }

    this.setIgnoreMouseOut(type, ignore);
    this.toggle(ignore);
  };

  protected onClickOut = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if(
      e.isTrusted &&
      !findUpAsChild(target, this.element) &&
      !Array.from(this.ignoreButtons).some((button) => findUpAsChild(target, button) || target === button) &&
      this.ignoreMouseOut.size <= 1 &&
      (!this.ignoreOutClickClassName || !findUpClassName(target, this.ignoreOutClickClassName))
    ) {
      this.toggle(false);
    }
  };

  protected onMouseOut = (e: MouseEvent) => {
    if(KEEP_OPEN || !this.isActive()) return;
    this.clearTimeout('toggle');

    if(this.ignoreMouseOut.size) {
      return;
    }

    const toElement = (e as any).toElement as HTMLElement;
    if(toElement && findUpAsChild(toElement, this.element)) {
      return;
    }

    this.setTimeout('toggle', () => {
      this.toggle(false);
    }, TOGGLE_TIMEOUT);
  };

  protected clearTimeout(type: DropdownHoverTimeoutType) {
    if(this.timeouts[type] !== undefined) {
      clearTimeout(this.timeouts[type]);
      delete this.timeouts[type];
    }
  }

  protected setTimeout(type: DropdownHoverTimeoutType, cb: () => void, timeout: number) {
    this.clearTimeout(type);
    this.timeouts[type] = window.setTimeout(() => {
      this.clearTimeout(type);
      cb();
    }, timeout);
  }

  public init() {
    if(!IS_TOUCH_SUPPORTED) {
      this.element.onmouseout = this.onMouseOut;
      this.element.onmouseover = (e) => {
        if(this.forceClose) {
          return;
        }

        // console.log('onmouseover element');
        this.clearTimeout('toggle');
      };
    }
  }

  public toggle = async(enable?: boolean) => {
    // if(!this.element) return;
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

    const delay = IS_TOUCH_SUPPORTED || !liteMode.isAvailable('animations') ? 0 : ANIMATION_DURATION;
    if((this.element.style.display && enable === undefined) || enable) {
      const res = this.dispatchResultableEvent('open');
      await Promise.all(res);

      this.element.style.display = '';
      void this.element.offsetLeft; // reflow
      this.element.classList.add('active');

      this.dispatchEvent('openAfterLayout');

      appNavigationController.pushItem(this.navigationItem = {
        type: 'dropdown',
        onPop: () => {
          this.toggle(false);
        }
      });

      this.clearTimeout('toggle');
      this.setTimeout('done', () => {
        this.forceClose = false;
        this.dispatchEvent('opened');
      }, delay);

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
      this.ignoreMouseOut.clear();
      this.ignoreButtons.clear();

      this.element.classList.remove('active');

      appNavigationController.removeItem(this.navigationItem);
      this.detachClickEvent?.();
      this.detachClickEvent = undefined;

      this.clearTimeout('toggle');
      this.setTimeout('done', () => {
        this.element.style.display = 'none';
        this.forceClose = false;
        this.dispatchEvent('closed');
      }, delay);

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

    // animationIntersector.checkAnimations(false, EMOTICONSSTICKERGROUP);
  };

  public isActive() {
    return this.element.classList.contains('active');
  }

  public setIgnoreMouseOut(type: IgnoreMouseOutType, ignore: boolean) {
    ignore ? this.ignoreMouseOut.add(type) : this.ignoreMouseOut.delete(type);
  }
}
