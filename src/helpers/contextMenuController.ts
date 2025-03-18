/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import mediaSizes from './mediaSizes';
import OverlayClickHandler from './overlayClickHandler';
import overlayCounter from './overlayCounter';
import pause from './schedulers/pause';

type AdditionalMenuItem = {
  level: number,
  element: HTMLElement,
  triggerElement: HTMLElement,
  close: () => void,
}

class ContextMenuController extends OverlayClickHandler {
  protected additionalMenus: AdditionalMenuItem[] = [];

  constructor() {
    super('menu', true);

    mediaSizes.addEventListener('resize', () => {
      if(this.element) {
        this.close();
      }

      /* if(openedMenu && (openedMenu.style.top || openedMenu.style.left)) {
        const rect = openedMenu.getBoundingClientRect();
        const {innerWidth, innerHeight} = window;

        console.log(innerWidth, innerHeight, rect);
      } */
    });
  }

  public isOpened() {
    return !!this.element;
  }

  private onMouseMove = (e: MouseEvent) => {
    const allMenus = [
      ...[...this.additionalMenus].reverse(),
      {
        triggerElement: undefined,
        level: 0,
        element: this.element,
        close: () => this.close()
      }
    ];

    function isFartherThan(element: HTMLElement, distance: number) {
      const {clientX, clientY} = e;

      const rect = element.getBoundingClientRect();

      const diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
      const diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;

      return diffX >= distance || diffY >= distance;
    }

    for(const item of allMenus) {
      if(item.triggerElement && !isFartherThan(item.triggerElement, 40)) break;

      if(isFartherThan(item.element, item.level === 0 ? 100 : 40)) {
        this.closeAndRemoveMenu(item);
      } else {
        break;
      }
    }
  };

  protected closeAndRemoveMenu(item: AdditionalMenuItem) {
    item.close();
    const idx = this.additionalMenus.indexOf(item);
    if(idx > -1) this.additionalMenus.splice(idx, 1);
  }

  public closeMenusByLevel(level: number) {
    this.additionalMenus.filter((menu) => menu.level === level).forEach((item) => {
      item.close();
      const idx = this.additionalMenus.indexOf(item);
      if(idx > -1) this.additionalMenus.splice(idx, 1);
    });
  }

  public close() {
    if(this.element) {
      const {parentElement} = this.element;
      this.element.classList.remove('active');
      parentElement && parentElement.classList.remove('menu-open');

      if(this.element.classList.contains('night')) {
        const element = this.element;
        setTimeout(() => {
          if(element.classList.contains('active')) {
            return;
          }

          element.classList.remove('night');
        }, 400);
      }
    }

    this.additionalMenus.forEach((menu) => {
      menu.close();
    });

    this.additionalMenus = [];

    super.close();

    if(!IS_TOUCH_SUPPORTED) {
      window.removeEventListener('mousemove', this.onMouseMove);
    }
  }

  public openBtnMenu(element: HTMLElement, onClose?: () => void) {
    if(overlayCounter.isDarkOverlayActive) {
      element.classList.add('night');
    }

    super.open(element);

    const {parentElement} = this.element;
    this.element.classList.add('active', 'was-open');
    parentElement.classList.add('menu-open');

    if(onClose) {
      this.addEventListener('toggle', onClose, {once: true});
    }

    if(!IS_TOUCH_SUPPORTED) {
      window.addEventListener('mousemove', this.onMouseMove);
    }
  }

  public addAdditionalMenu(element: HTMLElement, triggerElement: HTMLElement, level: number, onClose?: () => void) {
    this.closeMenusByLevel(level);

    this.additionalMenus.push({
      element,
      triggerElement,
      level,
      close: () => {
        element.classList.remove('active');
        pause(400).then(() => element.remove());
        onClose();
      }
    });
    element.classList.add('active', 'was-open');

    if(onClose) {
      this.addEventListener('toggle', onClose, {once: true});
    }
  }
}

const contextMenuController = new ContextMenuController();
export default contextMenuController;
