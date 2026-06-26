import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import cancelEvent from '@helpers/dom/cancelEvent';
import {CLICK_EVENT_NAME, hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import EventListenerBase from '@helpers/eventListenerBase';
import {getOverlayRoot} from '@helpers/appWindow';

export default class OverlayClickHandler extends EventListenerBase<{
  toggle: (open: boolean) => void
}> {
  protected element: HTMLElement;
  protected overlay: HTMLElement;
  protected listenerOptions: AddEventListenerOptions;
  // The realm (document/window) the currently-open menu lives in. Defaults to the main realm and is
  // re-derived from the opened element's `ownerDocument` in `open()` — so a menu opened while the
  // client is popped out attaches its close listeners to the Document PiP window, not the tab.
  protected realmDocument: Document = document;
  protected realmWindow: Window & typeof globalThis = window;

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
      const isRoot = this.element === this.element.ownerDocument.body;
      if(!isRoot && findUpAsChild(e.target as HTMLElement, this.element)) {
        return;
      }
    }

    if(this.listenerOptions?.capture) {
      cancelEvent(e);
    }

    this.close(e);
  };

  public close(e?: MouseEvent | TouchEvent) {
    if(this.element) {
      this.overlay?.remove();
      this.element = undefined;
      this.dispatchEvent('toggle', false);
    }

    if(!IS_TOUCH_SUPPORTED) {
      // window.removeEventListener('keydown', onKeyDown, {capture: true});
      this.realmWindow.removeEventListener('contextmenu', this.onClick, this.listenerOptions);
    }

    this.realmDocument.removeEventListener(CLICK_EVENT_NAME, this.onClick, this.listenerOptions);

    if(!IS_MOBILE_SAFARI && this.navigationType) {
      appNavigationController.removeByType(this.navigationType);
    }
  }

  public open(element = getOverlayRoot()) {
    this.close();

    const doc = this.realmDocument = element.ownerDocument || document;
    const win = this.realmWindow = (doc.defaultView as Window & typeof globalThis) || window;

    if(!IS_MOBILE_SAFARI && this.navigationType) {
      appNavigationController.pushItem({
        type: this.navigationType,
        onPop: (canAnimate) => {
          this.close();
        }
      });
    }

    this.element = element;

    // Recreate the overlay when the realm changes — a node created in one document can't be reused
    // across windows.
    if((!this.overlay || this.overlay.ownerDocument !== doc) && this.withOverlay) {
      this.overlay = doc.createElement('div');
      this.overlay.classList.add('btn-menu-overlay');

      // ! because this event must be canceled, and can't cancel on menu click (below)
      this.overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
        cancelEvent(e);
        this.onClick(e);
      });
    }

    const isRoot = this.element === doc.body;
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
      win.addEventListener('contextmenu', this.onClick, {...this.listenerOptions, once: true});
    }

    /* // ! because this event must be canceled, and can't cancel on menu click (below)
    overlay.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      onClick(e);
    }); */

    // ! safari iOS doesn't handle window click event on overlay, idk why
    doc.addEventListener(CLICK_EVENT_NAME, this.onClick, this.listenerOptions);

    this.dispatchEvent('toggle', true);
  }
}
