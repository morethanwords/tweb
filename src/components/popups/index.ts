import rootScope from "../../lib/rootScope";
import { blurActiveElement, cancelEvent, findUpClassName } from "../../helpers/dom";
import { ripple } from "../ripple";

export type PopupOptions = Partial<{closable: true, overlayClosable: true, withConfirm: string, body: true}>;
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

      this.btnClose.addEventListener('click', this.destroy, {once: true});

      if(options.overlayClosable) {
        const onOverlayClick = (e: MouseEvent) => {
          if(!findUpClassName(e.target, 'popup-container')) {
            this.btnClose.click();
          }
        };
    
        this.element.addEventListener('click', onOverlayClick, {once: true});
      }
    }

    window.addEventListener('keydown', this._onKeyDown, {capture: true});

    if(options.withConfirm) {
      this.btnConfirm = document.createElement('button');
      this.btnConfirm.classList.add('btn-primary');
      this.btnConfirm.innerText = options.withConfirm;
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
        button.className = 'btn' + (b.isDanger ? ' danger' : '');
        button.innerHTML =  b.text;
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

  private _onKeyDown = (e: KeyboardEvent) => {
    if(e.key == 'Escape' && this.onEscape()) {
      cancelEvent(e);
      this.destroy();
    }
  };

  public show() {
    blurActiveElement(); // * hide mobile keyboard
    document.body.append(this.element);
    void this.element.offsetWidth; // reflow
    this.element.classList.add('active');
    rootScope.overlayIsActive = true;
  }

  public destroy = () => {
    this.onClose && this.onClose();
    this.element.classList.remove('active');

    window.removeEventListener('keydown', this._onKeyDown, {capture: true});
    if(this.btnClose) this.btnClose.removeEventListener('click', this.destroy);
    rootScope.overlayIsActive = false;

    setTimeout(() => {
      this.element.remove();
      this.onCloseAfterTimeout && this.onCloseAfterTimeout();
    }, 1000);
  };
}

export type PopupButton = {
  text: string,
  callback?: () => void,
  isDanger?: true,
  isCancel?: true
};
