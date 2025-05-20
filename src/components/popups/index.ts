/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ripple from '../ripple';
import animationIntersector from '../animationIntersector';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {i18n, LangPackKey, _i18n} from '../../lib/langPack';
import findUpClassName from '../../helpers/dom/findUpClassName';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import ListenerSetter from '../../helpers/listenerSetter';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import isSendShortcutPressed from '../../helpers/dom/isSendShortcutPressed';
import cancelEvent from '../../helpers/dom/cancelEvent';
import EventListenerBase, {EventListenerListeners} from '../../helpers/eventListenerBase';
import {addFullScreenListener, getFullScreenElement} from '../../helpers/dom/fullScreen';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {AppManagers} from '../../lib/appManagers/managers';
import overlayCounter from '../../helpers/overlayCounter';
import Scrollable from '../scrollable';
import {getMiddleware, MiddlewareHelper} from '../../helpers/middleware';
import ButtonIcon from '../buttonIcon';
import Icon from '../icon';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {JSX} from 'solid-js';
import {render} from 'solid-js/web';

export type PopupButton = {
  text?: HTMLElement | DocumentFragment | Text,
  callback?: (e: MouseEvent) => void | MaybePromise<boolean>,
  langKey?: LangPackKey,
  langArgs?: any[],
  isDanger?: boolean,
  isCancel?: boolean,
  element?: HTMLButtonElement,
  noRipple?: boolean,
  iconLeft?: Icon,
  iconRight?: Icon
};

export type PopupOptions = Partial<{
  closable: boolean,
  onBackClick: () => void | false,
  isConfirmationNeededOnClose: () => void | boolean | Promise<any>, // should return boolean instantly or `Promise` from `confirmationPopup`
  overlayClosable: boolean,
  withConfirm: LangPackKey | boolean,
  body: boolean,
  footer: boolean,
  confirmShortcutIsSendShortcut: boolean,
  withoutOverlay: boolean,
  scrollable: boolean,
  buttons: Array<PopupButton>,
  title: boolean | LangPackKey | DocumentFragment | HTMLElement,
  floatingHeader: boolean,
  withFooterConfirm: boolean
}>;

export interface PopupElementConstructable<T extends PopupElement = any> {
  new(...args: any[]): T;
}

const DEFAULT_APPEND_TO = document.body;
let appendPopupTo = DEFAULT_APPEND_TO;

const onFullScreenChange = () => {
  appendPopupTo = getFullScreenElement() || DEFAULT_APPEND_TO;
  PopupElement.reAppend();
};

addFullScreenListener(DEFAULT_APPEND_TO, onFullScreenChange);

type PopupListeners = {
  close: () => void,
  closeAfterTimeout: () => void
};

export default class PopupElement<T extends EventListenerListeners = {}> extends EventListenerBase<PopupListeners & T> {
  private static POPUPS: PopupElement<any>[] = [];
  public static MANAGERS: AppManagers;

  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');
  protected footer: HTMLElement;
  protected btnClose: HTMLElement;
  protected btnCloseAnimatedIcon: HTMLElement;
  protected btnConfirm: HTMLButtonElement;
  protected body: HTMLElement;
  protected buttonsEl: HTMLElement;

  protected isConfirmationNeededOnClose: PopupOptions['isConfirmationNeededOnClose'];

  protected navigationItem: NavigationItem;

  protected listenerSetter: ListenerSetter;

  protected confirmShortcutIsSendShortcut: boolean;
  protected btnConfirmOnEnter: HTMLElement;

  protected withoutOverlay: boolean;

  protected managers: AppManagers;

  protected scrollable: Scrollable;

  protected buttons: Array<PopupButton>;

  protected middlewareHelper: MiddlewareHelper;
  protected destroyed: boolean;
  protected shown: boolean;

  protected night: boolean;

  constructor(className: string, options: PopupOptions = {}) {
    super(false);
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    if(overlayCounter.isDarkOverlayActive) {
      this.night = true;
      this.element.classList.add('night');
    }

    this.header.classList.add('popup-header');

    if(options.title) {
      this.title.classList.add('popup-title');
      if(typeof(options.title) === 'string') {
        _i18n(this.title, options.title);
      } else if(typeof(options.title) !== 'boolean') {
        this.title.append(options.title);
      }

      this.header.append(this.title);
    }

    this.isConfirmationNeededOnClose = options.isConfirmationNeededOnClose;
    this.middlewareHelper = getMiddleware();
    this.listenerSetter = new ListenerSetter();
    this.managers = PopupElement.MANAGERS;

    this.confirmShortcutIsSendShortcut = options.confirmShortcutIsSendShortcut;

    if(options.closable) {
      this.btnClose = ButtonIcon('', {noRipple: true});
      this.btnClose.classList.add('popup-close');
      // ripple(this.closeBtn);
      this.header.prepend(this.btnClose);

      if(options.onBackClick) {
        this.btnCloseAnimatedIcon = document.createElement('div');
        this.btnCloseAnimatedIcon.classList.add('animated-close-icon');
        this.btnClose.append(this.btnCloseAnimatedIcon);
      } else {
        this.btnClose.append(Icon('close'));
      }

      attachClickEvent(this.btnClose, () => {
        if(options.onBackClick && this.btnCloseAnimatedIcon.classList.contains('state-back')) {
          if(options.onBackClick() !== false) {
            this.btnCloseAnimatedIcon.classList.remove('state-back');
          }
        } else {
          this.hide();
        }
      }, {listenerSetter: this.listenerSetter});
    }

    this.withoutOverlay = options.withoutOverlay;
    if(this.withoutOverlay) {
      this.element.classList.add('no-overlay');
    }

    if(options.overlayClosable) {
      attachClickEvent(this.element, (e: MouseEvent) => {
        if(findUpClassName(e.target, 'popup-container') || !(e.target as HTMLElement).isConnected) {
          return;
        }

        this.hide();
      }, {listenerSetter: this.listenerSetter});
    }

    if(options.withConfirm) {
      this.btnConfirm = document.createElement('button');
      this.btnConfirm.classList.add('btn-primary', 'btn-color-primary');
      if(options.withConfirm !== true) {
        this.btnConfirm.append(i18n(options.withConfirm));
      }
      this.header.append(this.btnConfirm);
      // ripple(this.btnConfirm);
    }

    this.container.append(this.header);
    if(options.body) {
      this.body = document.createElement('div');
      this.body.classList.add('popup-body');
      this.container.append(this.body);
    }

    if(options.scrollable) {
      const scrollable = this.scrollable = new Scrollable(this.body);
      this.attachScrollableListeners();

      if(options.floatingHeader) {
        this.attachScrollableListeners(this.header);
        const background = document.createElement('div');
        background.classList.add('popup-header-background');
        this.header.prepend(background);
        this.header.classList.add('is-floating');
      }

      if(!this.body) {
        this.header.after(scrollable.container);
      }
    }

    if(options.footer) {
      this.footer = document.createElement('div');
      this.footer.classList.add('popup-footer');
      (this.body || this.container).append(this.footer);

      if(options.withFooterConfirm) {
        this.footer.append(this.btnConfirm);
      }
    }

    this.btnConfirmOnEnter = this.btnConfirm;
    this.setButtons(options.buttons);

    this.element.append(this.container);

    PopupElement.POPUPS.push(this);
  }

  protected setButtons(buttons: PopupButton[]) {
    this.buttons = buttons;
    if(this.buttonsEl) {
      this.buttonsEl.remove();
      this.buttonsEl = undefined;
    }

    if(!buttons?.length) {
      return;
    }

    const buttonsDiv = this.buttonsEl = document.createElement('div');
    buttonsDiv.classList.add('popup-buttons');

    const buttonsElements = buttons.map((b) => {
      const button = document.createElement('button');
      button.className = 'popup-button btn' + (b.isDanger ? ' danger' : ' primary');

      if(!b.noRipple) {
        ripple(button);
      }

      if(b.text) {
        button.append(b.text);
      } else if(b.langKey) {
        button.append(i18n(b.langKey, b.langArgs));
      }

      if(b.iconLeft || b.iconRight) {
        const i = Icon(b.iconLeft || b.iconRight, 'popup-button-icon', b.iconLeft ? 'left' : 'right');
        button.classList.add('with-icon');
        if(b.iconLeft) button.prepend(i);
        else button.append(i);
      }

      attachClickEvent(button, async(e) => {
        let result = b.callback?.(e);
        if(result !== undefined && result instanceof Promise) {
          const toggle = toggleDisability([b.element], true);
          try {
            result = await result;
          } catch(err) {
            result = false;
          }

          if(result === false) {
            toggle();
          }
        }

        if(result === false) {
          return;
        }

        this.hide();
      }, {listenerSetter: this.listenerSetter});

      return b.element = button;
    });

    if(!this.btnConfirmOnEnter && buttons.length === 2) {
      const button = buttons.find((button) => !button.isCancel);
      if(button) {
        this.btnConfirmOnEnter = button.element;
      }
    }

    if(buttons.length >= 3) {
      buttonsDiv.classList.add('is-vertical-layout');
    }

    buttonsDiv.append(...buttonsElements);
    this.container.append(buttonsDiv);
  }

  protected attachScrollableListeners(setClassOn?: HTMLElement) {
    return this.scrollable.attachBorderListeners(setClassOn);
  }

  protected onContentUpdate() {
    this.scrollable?.onAdditionalScroll?.();
  }

  public show() {
    if(this.shown || this.destroyed) {
      return;
    }

    this.shown = true;
    this.navigationItem = {
      type: 'popup',
      onPop: () => {
        if(this.isConfirmationNeededOnClose) {
          const result = this.isConfirmationNeededOnClose();
          if(result) {
            Promise.resolve(result).then(() => {
              this.destroy();
            });

            return false;
          }
        }

        return this.destroy();
      }
    };

    appNavigationController.pushItem(this.navigationItem);

    blurActiveElement(); // * hide mobile keyboard
    appendPopupTo.append(this.element);
    void this.element.offsetWidth; // reflow
    this.element.classList.add('active');

    this.onContentUpdate();

    if(!this.withoutOverlay) {
      overlayCounter.isOverlayActive = true;
      animationIntersector.checkAnimations2(true);
    }

    // cannot add event instantly because keydown propagation will fire it
    // if(this.btnConfirmOnEnter) {
    setTimeout(() => {
      if(!this.element.classList.contains('active')) {
        return;
      }

      this.listenerSetter.add(document.body)('keydown', (e) => {
        if(!this.btnConfirmOnEnter ||
          (this.btnConfirmOnEnter as HTMLButtonElement).disabled ||
          PopupElement.POPUPS[PopupElement.POPUPS.length - 1] !== this) {
          return;
        }

        if(this.confirmShortcutIsSendShortcut ? isSendShortcutPressed(e) : e.key === 'Enter') {
          simulateClickEvent(this.btnConfirmOnEnter);
          cancelEvent(e);
        }
      });
    }, 0);
    // }
  }

  public hide() {
    if(this.destroyed) {
      return;
    }

    if(!this.navigationItem) {
      this.destroy();
      return;
    }

    appNavigationController.backByItem(this.navigationItem);
  }

  public hideWithCallback = (callback: () => void) => {
    this.addEventListener('closeAfterTimeout', callback as any);
    this.hide();
  };

  public forceHide() {
    return this.destroy();
  }

  protected destroy() {
    if(this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.dispatchEvent<PopupListeners>('close');
    this.element.classList.add('hiding');
    this.element.classList.remove('active');
    this.listenerSetter.removeAll();
    this.middlewareHelper.destroy();

    if(!this.withoutOverlay) {
      overlayCounter.isOverlayActive = false;
    }

    appNavigationController.removeItem(this.navigationItem);
    this.navigationItem = undefined;

    indexOfAndSplice(PopupElement.POPUPS, this);

    // ! calm
    onFullScreenChange();

    setTimeout(() => {
      this.element.remove();
      this.dispatchEvent<PopupListeners>('closeAfterTimeout');
      this.cleanup();
      this.scrollable?.destroy();

      if(!this.withoutOverlay) {
        animationIntersector.checkAnimations2(false);
      }
    }, 250);
  }

  protected appendSolid(callback: () => JSX.Element) {
    const div = document.createElement('div');
    (this.scrollable || this.body).prepend(div);
    const dispose = render(callback, div);
    this.addEventListener('closeAfterTimeout', dispose as any);
  }

  protected appendSolidBody(callback: () => JSX.Element) {
    const dispose = render(callback, this.body);
    this.addEventListener('closeAfterTimeout', dispose as any);
  }

  public static reAppend() {
    this.POPUPS.forEach((popup) => {
      const {element, container} = popup;
      const parentElement = element.parentElement;
      if(parentElement && parentElement !== appendPopupTo && appendPopupTo !== container) {
        appendPopupTo.append(element);
      }
    });
  }

  public static getPopups<T extends PopupElement>(popupConstructor: PopupElementConstructable<T>) {
    return this.POPUPS.filter((element) => element instanceof popupConstructor) as T[];
  }

  public static createPopup<T extends /* PopupElement */any, A extends Array<any>>(ctor: {new(...args: A): T}, ...args: A) {
    const popup = new ctor(...args);
    return popup;
  }
}

export const addCancelButton = (buttons: PopupButton[]) => {
  const button = buttons.find((b) => b.isCancel);
  if(!button) {
    buttons.push({
      langKey: 'Cancel',
      isCancel: true
    });
  }

  return buttons;
};
