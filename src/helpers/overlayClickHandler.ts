/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appNavigationController, {NavigationItem} from '../components/appNavigationController';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import cancelEvent from './dom/cancelEvent';
import {CLICK_EVENT_NAME, hasMouseMovedSinceDown} from './dom/clickEvent';
import findUpAsChild from './dom/findUpAsChild';
import EventListenerBase from './eventListenerBase';

export default class OverlayClickHandler extends EventListenerBase<{
  toggle: (open: boolean) => void
}> {
  protected element: HTMLElement;
  protected overlay: HTMLElement;
  protected listenerOptions: AddEventListenerOptions;

  constructor(
    protected navigationType?: NavigationItem['type'],
    protected withOverlay?: boolean
  ) {
    super(false);
    this.listenerOptions = withOverlay ? {} : {capture: true};
  }

  protected onClick = (e: MouseEvent | TouchEvent) => {
    if(hasMouseMovedSinceDown(e)) {
      return;
    }

    if(this.element) {
      const isRoot = this.element === document.body;
      if(!isRoot && findUpAsChild(e.target as HTMLElement, this.element)) {
        return;
      }
    }

    if(this.listenerOptions?.capture) {
      cancelEvent(e);
    }

    this.close();
  };

  public close() {
    if(this.element) {
      this.overlay?.remove();
      this.element = undefined;
      this.dispatchEvent('toggle', false);
    }

    if(!IS_TOUCH_SUPPORTED) {
      // window.removeEventListener('keydown', onKeyDown, {capture: true});
      window.removeEventListener('contextmenu', this.onClick, this.listenerOptions);
    }

    document.removeEventListener(CLICK_EVENT_NAME, this.onClick, this.listenerOptions);

    if(!IS_MOBILE_SAFARI && this.navigationType) {
      appNavigationController.removeByType(this.navigationType);
    }
  }

  public open(element = document.body) {
    this.close();

    if(!IS_MOBILE_SAFARI && this.navigationType) {
      appNavigationController.pushItem({
        type: this.navigationType,
        onPop: (canAnimate) => {
          this.close();
        }
      });
    }

    this.element = element;

    if(!this.overlay && this.withOverlay) {
      this.overlay = document.createElement('div');
      this.overlay.classList.add('btn-menu-overlay');

      // ! because this event must be canceled, and can't cancel on menu click (below)
      this.overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
        cancelEvent(e);
        this.onClick(e);
      });
    }

    const isRoot = this.element === document.body;
    if(this.overlay) {
      if(isRoot) {
        this.element.append(this.overlay);
      } else {
        this.element.parentElement.insertBefore(this.overlay, this.element);
      }
    }

    // document.body.classList.add('disable-hover');

    if(!IS_TOUCH_SUPPORTED) {
      // window.addEventListener('keydown', onKeyDown, {capture: true});
      window.addEventListener('contextmenu', this.onClick, {...this.listenerOptions, once: true});
    }

    /* // ! because this event must be canceled, and can't cancel on menu click (below)
    overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      onClick(e);
    }); */

    // ! safari iOS doesn't handle window click event on overlay, idk why
    document.addEventListener(CLICK_EVENT_NAME, this.onClick, this.listenerOptions);

    this.dispatchEvent('toggle', true);
  }
}
