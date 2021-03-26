import rootScope from "../../lib/rootScope";
import { blurActiveElement, findUpClassName } from "../../helpers/dom";
import { ripple } from "../ripple";
import animationIntersector from "../animationIntersector";
import appNavigationController, { NavigationItem } from "../appNavigationController";
import { i18n, LangPackKey } from "../../lib/langPack";

export type PopupButton = {
  text?: string,
  callback?: () => void,
  langKey?: LangPackKey,
  langArgs?: any[],
  isDanger?: true,
  isCancel?: true
};

export type PopupOptions = Partial<{
  closable: true, 
  overlayClosable: true, 
  withConfirm: LangPackKey, 
  body: true
}>;

export default class PopupElement {
  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');
  protected btnClose: HTMLElement;
  protected btnConfirm: HTMLElement;
  protected body: HTMLElement;

  protected onClose: () => void;
  protected onCloseAfterTimeout: () => void;
  protected onEscape: () => boolean = () => true;

  protected navigationItem: NavigationItem;

  constructor(className: string, buttons?: Array<PopupButton>, options: PopupOptions = {}) {
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');
    this.title.classList.add('popup-title');

    this.header.append(this.title);

    if(options.closable) {
      this.btnClose = document.createElement('span');
      this.btnClose.classList.add('btn-icon', 'popup-close', 'tgico-close');
      //ripple(this.closeBtn);
      this.header.prepend(this.btnClose);

      this.btnClose.addEventListener('click', this.hide, {once: true});
    }

    if(options.overlayClosable) {
      const onOverlayClick = (e: MouseEvent) => {
        if(!findUpClassName(e.target, 'popup-container')) {
          this.hide();
          this.element.removeEventListener('click', onOverlayClick);
        }
      };
  
      this.element.addEventListener('click', onOverlayClick);
    }

    if(options.withConfirm) {
      this.btnConfirm = document.createElement('button');
      this.btnConfirm.classList.add('btn-primary', 'btn-color-primary');
      this.btnConfirm.append(i18n(options.withConfirm));
      this.header.append(this.btnConfirm);
      ripple(this.btnConfirm);
    }

    this.container.append(this.header);
    if(options.body) {
      this.body = document.createElement('div');
      this.body.classList.add('popup-body');
      this.container.append(this.body);
    }

    if(buttons && buttons.length) {
      const buttonsDiv = document.createElement('div');
      buttonsDiv.classList.add('popup-buttons');

      if(buttons.length === 2) {
        buttonsDiv.classList.add('popup-buttons-row');
      }
  
      const buttonsElements = buttons.map(b => {
        const button = document.createElement('button');
        button.className = 'btn' + (b.isDanger ? ' danger' : ' primary');

        if(b.text) {
          button.innerHTML =  b.text;
        } else {
          button.append(i18n(b.langKey, b.langArgs));
        }

        ripple(button);
  
        if(b.callback) {
          button.addEventListener('click', () => {
            b.callback();
            this.destroy();
          }, {once: true});
        } else if(b.isCancel) {
          button.addEventListener('click', () => {
            this.destroy();
          }, {once: true});
        }
  
        return button;
      });
  
      buttonsDiv.append(...buttonsElements);
      this.container.append(buttonsDiv);
    }

    this.element.append(this.container);
  }

  public show() {
    this.navigationItem = {
      type: 'popup',
      onPop: this.destroy,
      onEscape: this.onEscape
    };

    appNavigationController.pushItem(this.navigationItem);

    blurActiveElement(); // * hide mobile keyboard
    document.body.append(this.element);
    void this.element.offsetWidth; // reflow
    this.element.classList.add('active');
    rootScope.overlayIsActive = true;
    animationIntersector.checkAnimations(true);
  }

  public hide = () => {
    appNavigationController.back('popup');
  };

  private destroy = () => {
    this.onClose && this.onClose();
    this.element.classList.add('hiding');
    this.element.classList.remove('active');

    if(this.btnClose) this.btnClose.removeEventListener('click', this.hide);
    rootScope.overlayIsActive = false;

    appNavigationController.removeItem(this.navigationItem);
    this.navigationItem = undefined;

    setTimeout(() => {
      this.element.remove();
      this.onCloseAfterTimeout && this.onCloseAfterTimeout();
      animationIntersector.checkAnimations(false);
    }, 150);
  };
}

export const addCancelButton = (buttons: PopupButton[]) => {
  const button = buttons.find(b => b.isCancel);
  if(!button) {
    buttons.push({
      langKey: 'Cancel',
      isCancel: true
    });
  }

  return buttons;
};
