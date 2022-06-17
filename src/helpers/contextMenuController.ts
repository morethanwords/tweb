/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appNavigationController from "../components/appNavigationController";
import IS_TOUCH_SUPPORTED from "../environment/touchSupport";
import { IS_MOBILE_SAFARI } from "../environment/userAgent";
import cancelEvent from "./dom/cancelEvent";
import { CLICK_EVENT_NAME } from "./dom/clickEvent";
import EventListenerBase from "./eventListenerBase";
import mediaSizes from "./mediaSizes";

class ContextMenuController extends EventListenerBase<{
  toggle: (open: boolean) => void
}> {
  private openedMenu: HTMLElement;
  private menuOverlay: HTMLElement;
  private openedMenuOnClose: () => void;

  constructor() {
    super();
    
    mediaSizes.addEventListener('resize', () => {
      if(this.openedMenu) {
        this.closeBtnMenu();
      }
      
      /* if(openedMenu && (openedMenu.style.top || openedMenu.style.left)) {
        const rect = openedMenu.getBoundingClientRect();
        const {innerWidth, innerHeight} = window;
    
        console.log(innerWidth, innerHeight, rect);
      } */
    })
  }

  public isOpened() {
    return !!this.openedMenu;
  }

  private onMouseMove = (e: MouseEvent) => {
    let rect = this.openedMenu.getBoundingClientRect();
    let {clientX, clientY} = e;

    let diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
    let diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;

    if(diffX >= 100 || diffY >= 100) {
      this.closeBtnMenu();
      //openedMenu.parentElement.click();
    }
    //console.log('mousemove', diffX, diffY);
  };

  private onClick = (e: MouseEvent | TouchEvent) => {
    //cancelEvent(e);
    this.closeBtnMenu();
  };

  // ! no need in this due to the same handler in appNavigationController
  /* const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Escape') {
      closeBtnMenu();
      cancelEvent(e);
    }
  }; */

  public closeBtnMenu = () => {
    if(this.openedMenu) {
      this.openedMenu.classList.remove('active');
      this.openedMenu.parentElement.classList.remove('menu-open');
      //openedMenu.previousElementSibling.remove(); // remove overlay
      if(this.menuOverlay) this.menuOverlay.remove();
      this.openedMenu = undefined;
  
      this.dispatchEvent('toggle', false);
    }
    
    if(this.openedMenuOnClose) {
      this.openedMenuOnClose();
      this.openedMenuOnClose = undefined;
    }
  
    if(!IS_TOUCH_SUPPORTED) {
      window.removeEventListener('mousemove', this.onMouseMove);
      //window.removeEventListener('keydown', onKeyDown, {capture: true});
      window.removeEventListener('contextmenu', this.onClick);
    }
  
    document.removeEventListener(CLICK_EVENT_NAME, this.onClick);
  
    if(!IS_MOBILE_SAFARI) {
      appNavigationController.removeByType('menu');
    }
  };

  public openBtnMenu(menuElement: HTMLElement, onClose?: () => void) {
    this.closeBtnMenu();
  
    if(!IS_MOBILE_SAFARI) {
      appNavigationController.pushItem({
        type: 'menu',
        onPop: (canAnimate) => {
          this.closeBtnMenu();
        }
      });
    }
    
    this.openedMenu = menuElement;
    this.openedMenu.classList.add('active');
    this.openedMenu.parentElement.classList.add('menu-open');
  
    if(!this.menuOverlay) {
      this.menuOverlay = document.createElement('div');
      this.menuOverlay.classList.add('btn-menu-overlay');
  
      // ! because this event must be canceled, and can't cancel on menu click (below)
      this.menuOverlay.addEventListener(CLICK_EVENT_NAME, (e) => {
        cancelEvent(e);
        this.onClick(e);
      });
    }
  
    this.openedMenu.parentElement.insertBefore(this.menuOverlay, this.openedMenu);
  
    //document.body.classList.add('disable-hover');
    
    this.openedMenuOnClose = onClose;
  
    if(!IS_TOUCH_SUPPORTED) {
      window.addEventListener('mousemove', this.onMouseMove);
      //window.addEventListener('keydown', onKeyDown, {capture: true});
      window.addEventListener('contextmenu', this.onClick, {once: true});
    }
  
    /* // ! because this event must be canceled, and can't cancel on menu click (below)
    overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      onClick(e);
    }); */
    
    // ! safari iOS doesn't handle window click event on overlay, idk why
    document.addEventListener(CLICK_EVENT_NAME, this.onClick);
  
    this.dispatchEvent('toggle', true);
  }
}

const contextMenuController = new ContextMenuController();
export default contextMenuController;
