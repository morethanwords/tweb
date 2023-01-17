/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import mediaSizes from './mediaSizes';
import OverlayClickHandler from './overlayClickHandler';

class ContextMenuController extends OverlayClickHandler {
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
    const rect = this.element.getBoundingClientRect();
    const {clientX, clientY} = e;

    const diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
    const diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;

    if(diffX >= 100 || diffY >= 100) {
      this.close();
      // openedMenu.parentElement.click();
    }
    // console.log('mousemove', diffX, diffY);
  };

  public close() {
    if(this.element) {
      this.element.classList.remove('active');
      this.element.parentElement.classList.remove('menu-open');
    }

    super.close();

    if(!IS_TOUCH_SUPPORTED) {
      window.removeEventListener('mousemove', this.onMouseMove);
    }
  }

  public openBtnMenu(element: HTMLElement, onClose?: () => void) {
    super.open(element);

    this.element.classList.add('active', 'was-open');
    this.element.parentElement.classList.add('menu-open');

    if(onClose) {
      this.addEventListener('toggle', onClose, {once: true});
    }

    if(!IS_TOUCH_SUPPORTED) {
      window.addEventListener('mousemove', this.onMouseMove);
    }
  }
}

const contextMenuController = new ContextMenuController();
export default contextMenuController;
