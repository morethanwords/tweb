import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import findUpClassName from '@helpers/dom/findUpClassName';
import mediaSizes from '@helpers/mediaSizes';
import OverlayClickHandler from '@helpers/overlayClickHandler';
import overlayCounter from '@helpers/overlayCounter';
import pause from '@helpers/schedulers/pause';
import cancelEvent from '@helpers/dom/cancelEvent';
import createFocusTrap, {FocusTrap} from '@helpers/dom/focusTrap';

import {getEnabledMenuItems, handleMenuKeyDown} from '@helpers/dom/menuKeyboard';
import {onAppWindowChange} from '@helpers/appWindow';

type AdditionalMenuItem = {
  level: number,
  element: HTMLElement,
  triggerElement: HTMLElement,
  close: () => void,
}

class ContextMenuController extends OverlayClickHandler {
  protected additionalMenus: AdditionalMenuItem[] = [];
  protected menuOpenTarget: HTMLElement;
  protected focusTrap: FocusTrap;
  protected focusedMenu: HTMLElement;
  protected onEscape = (event: KeyboardEvent) => {
    if(this.focusedMenu && this.focusedMenu !== this.element) {
      cancelEvent(event);
      this.closeFocusedAdditionalMenu();
      return false;
    }
    return true;
  };

  // Keyboard navigation inside the open menu: arrows move between enabled items
  // (wrapping), Home/End jump to the ends, Enter/Space activate the focused item
  // (via its existing click path), Escape closes (focus is restored on close).
  private onKeyDown = (e: KeyboardEvent) => {
    const menu = this.focusedMenu;
    if(!menu || e.defaultPrevented || e.isComposing) {
      return;
    }

    if(e.key === 'Tab') {
      this.close();
      return;
    }

    if(e.key === 'Escape') {
      e.preventDefault();
      if(menu !== this.element) {
        this.closeFocusedAdditionalMenu();
      } else {
        this.close();
      }
      return;
    }


    if(e.key === 'ArrowLeft' && menu !== this.element) {
      e.preventDefault();
      this.closeFocusedAdditionalMenu();
      return;
    }

    handleMenuKeyDown(e, menu);
  };

  protected activateFocus(element: HTMLElement, initialFocus?: HTMLElement) {
    this.deactivateFocus(false);
    this.focusedMenu = element;
    this.focusTrap = createFocusTrap(element);
    this.realmDocument.addEventListener('keydown', this.onKeyDown, true);

    const items = getEnabledMenuItems(element);
    // Always restore to the root trigger when the complete menu closes. Moving
    // between a parent menu and a submenu swaps traps without restoring first.
    this.focusTrap.activate(this.menuOpenTarget, initialFocus || items[0] || element);
    // `visibility` transitions from hidden on the opening frame. Browsers can
    // reject focus until that frame is painted; do not leave keyboard users on
    // the trigger when this happens.
    this.realmWindow.requestAnimationFrame(() => this.realmWindow.requestAnimationFrame(() => {
      if(this.focusedMenu === element &&
        (this.realmDocument.activeElement === element || !element.contains(this.realmDocument.activeElement))) {
        (initialFocus || getEnabledMenuItems(element)[0] || element).focus();
      }
    }));
  }

  protected deactivateFocus(restoreFocus = true) {
    if(!this.focusTrap) {
      return;
    }

    this.realmDocument.removeEventListener('keydown', this.onKeyDown, true);
    const trap = this.focusTrap;
    this.focusTrap = undefined;
    this.focusedMenu = undefined;
    trap.deactivate(restoreFocus);
  }

  private closeFocusedAdditionalMenu() {
    const item = this.additionalMenus.find(({element}) => element === this.focusedMenu);
    if(!item) {
      return;
    }

    this.closeAndRemoveMenu(item);
  }

  constructor() {
    super('menu', true);
    // Menus are transient and positioned against the outgoing viewport. Close
    // them before its document is adopted, including equal-size window moves.
    onAppWindowChange(() => this.close());

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

  /** Set for one open: see {@link keepNextOpenOnMouseMove}. */
  private keepOpenOnMouseMove = false;
  private keepOpenTimeout: number;

  /**
   * The next menu is opened away from the pointer — from a deep link rather than
   * a click — so the first mouse move must not close it: there is nothing for the
   * pointer to be moving away from yet.
   */
  public keepNextOpenOnMouseMove() {
    this.keepOpenOnMouseMove = true;

    // a click that opens nothing (a hidden trigger, a move since mousedown) would
    // otherwise leave the flag for the next menu the user opens themselves
    clearTimeout(this.keepOpenTimeout);
    this.keepOpenTimeout = window.setTimeout(() => this.keepOpenOnMouseMove = false, 1000);
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
    const idx = this.additionalMenus.indexOf(item);
    if(idx < 0) {
      item.close();
      return;
    }

    const closedItems = this.additionalMenus.slice(idx);
    const focusedMenuWasClosed = closedItems.some(({element}) => element === this.focusedMenu);
    const parentMenu = item.triggerElement?.closest('.btn-menu') as HTMLElement || this.element;

    item.close();
    for(let i = idx + 1; i < this.additionalMenus.length; i++) {
      this.additionalMenus[i].close();
    }
    this.additionalMenus.splice(idx);

    if(focusedMenuWasClosed && parentMenu) {
      this.activateFocus(parentMenu, item.triggerElement);
    }
  }

  public closeMenusByLevel(level: number) {
    const firstMenu = this.additionalMenus.find((menu) => menu.level >= level);
    if(firstMenu) {
      this.closeAndRemoveMenu(firstMenu);
    }
  }

  public close(e?: MouseEvent | TouchEvent) {
    if(e && (e.target as HTMLElement).classList.contains('btn-menu')) {
      return;
    }

    if(this.element) {
      this.element.classList.remove('active');
      this.menuOpenTarget?.classList.remove('menu-open');
      this.menuOpenTarget = undefined;

      // tear down keyboard nav + restore focus to the trigger
      this.deactivateFocus();

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
      this.realmWindow.removeEventListener('mousemove', this.onMouseMove);
    }
  }

  protected shouldApplyNight(triggerElement?: HTMLElement) {
    if(overlayCounter.isDarkOverlayActive) return true;
    const nightAncestor = triggerElement && findUpClassName(triggerElement, 'night');
    return !!nightAncestor && nightAncestor !== document.documentElement;
  }

  public openBtnMenu(
    element: HTMLElement,
    onClose?: () => void,
    triggerElement?: HTMLElement,
    activateFocus = !IS_TOUCH_SUPPORTED || !!triggerElement?.matches(':focus-visible')
  ) {
    if(this.shouldApplyNight(triggerElement)) {
      element.classList.add('night');
    }

    super.open(element);

    this.element.classList.add('active', 'was-open');
    this.menuOpenTarget = triggerElement ?? this.element.parentElement;
    this.menuOpenTarget?.classList.add('menu-open');

    if(onClose) {
      this.addEventListener('toggle', onClose, {once: true});
    }

    const keepOpen = this.keepOpenOnMouseMove;
    this.keepOpenOnMouseMove = false;
    clearTimeout(this.keepOpenTimeout);

    if(!IS_TOUCH_SUPPORTED && !keepOpen) {
      this.realmWindow.addEventListener('mousemove', this.onMouseMove);
    }

    if(activateFocus) {
      this.activateFocus(element);
    }
  }

  public addAdditionalMenu(
    element: HTMLElement,
    triggerElement: HTMLElement,
    level: number,
    onClose?: () => void,
    activateFocus = false
  ) {
    if(!this.element) return;

    this.closeMenusByLevel(level);
    triggerElement.setAttribute('aria-expanded', 'true');

    this.additionalMenus.push({
      element,
      triggerElement,
      level,
      close: () => {
        element.classList.remove('active');
        pause(400).then(() => element.remove());
        triggerElement.setAttribute('aria-expanded', 'false');
        onClose?.();
      }
    });
    if(this.shouldApplyNight(triggerElement)) {
      element.classList.add('night');
    }
    element.classList.add('active', 'was-open');

    if(onClose) {
      this.addEventListener('toggle', onClose, {once: true});
    }

    if(activateFocus) {
      this.activateFocus(element);
    }
  }
}

const contextMenuController = new ContextMenuController();
export default contextMenuController;
