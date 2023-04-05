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
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

export type PopupButton = {
  textRaw?: string,
  callback?: () => void,
  langKey?: LangPackKey,
  langArgs?: any[],
  isDanger?: boolean,
  isCancel?: boolean,
  element?: HTMLButtonElement,
  noRipple?: boolean
};

export type PopupOptions = Partial<{
  closable: boolean,
  onBackClick: () => void,
  isConfirmationNeededOnClose: () => void | boolean | Promise<any>, // should return boolean instantly or `Promise` from `confirmationPopup`
  overlayClosable: boolean,
  withConfirm: LangPackKey | boolean,
  body: boolean,
  footer: boolean,
  confirmShortcutIsSendShortcut: boolean,
  withoutOverlay: boolean,
  scrollable: boolean,
  buttons: Array<PopupButton>,
  title: boolean | LangPackKey,
  titleRaw: string
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

  constructor(className: string, options: PopupOptions = {}) {
    super(false);
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');

    if(options.title || options.titleRaw) {
      this.title.classList.add('popup-title');
      if(typeof(options.title) === 'string') {
        _i18n(this.title, options.title);
      } else if(options.titleRaw) {
        this.title.append(wrapEmojiText(options.titleRaw));
      }

      this.header.append(this.title);
    }

    this.isConfirmationNeededOnClose = options.isConfirmationNeededOnClose;
    this.middlewareHelper = getMiddleware();
    this.listenerSetter = new ListenerSetter();
    this.managers = PopupElement.MANAGERS;

    this.confirmShortcutIsSendShortcut = options.confirmShortcutIsSendShortcut;

    if(options.closable) {
      this.btnClose = document.createElement('span');
      this.btnClose.classList.add('btn-icon', 'popup-close');
      // ripple(this.closeBtn);
      this.header.prepend(this.btnClose);

      if(options.onBackClick) {
        this.btnCloseAnimatedIcon = document.createElement('div');
        this.btnCloseAnimatedIcon.classList.add('animated-close-icon');
        this.btnClose.append(this.btnCloseAnimatedIcon);
      } else {
        this.btnClose.classList.add('tgico-close');
      }

      attachClickEvent(this.btnClose, () => {
        if(options.onBackClick && this.btnCloseAnimatedIcon.classList.contains('state-back')) {
          this.btnClose.classList.remove('state-back');
          options.onBackClick();
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
        if(findUpClassName(e.target, 'popup-container')) {
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

      if(!this.body) {
        this.header.after(scrollable.container);
      }
    }

    if(options.footer) {
      this.footer = document.createElement('div');
      this.footer.classList.add('popup-footer');
      (this.body || this.container).append(this.footer);
    }

    let btnConfirmOnEnter = this.btnConfirm;
    const buttons = this.buttons = options.buttons;
    if(buttons?.length) {
      const buttonsDiv = this.buttonsEl = document.createElement('div');
      buttonsDiv.classList.add('popup-buttons');

      const buttonsElements = buttons.map((b) => {
        const button = document.createElement('button');
        button.className = 'btn' + (b.isDanger ? ' danger' : ' primary');

        if(!b.noRipple) {
          ripple(button);
        }

        if(b.textRaw) {
          button.append(wrapEmojiText(b.textRaw));
        } else {
          button.append(i18n(b.langKey, b.langArgs));
        }

        attachClickEvent(button, () => {
          b.callback?.();
          this.hide();
        }, {listenerSetter: this.listenerSetter, once: true});

        return b.element = button;
      });

      if(!btnConfirmOnEnter && buttons.length === 2) {
        const button = buttons.find((button) => !button.isCancel);
        if(button) {
          btnConfirmOnEnter = button.element;
        }
      }

      if(buttons.length >= 3) {
        buttonsDiv.classList.add('is-vertical-layout');
      }

      buttonsDiv.append(...buttonsElements);
      this.container.append(buttonsDiv);
    }

    this.btnConfirmOnEnter = btnConfirmOnEnter;

    this.element.append(this.container);

    PopupElement.POPUPS.push(this);
  }

  protected attachScrollableListeners(setClassOn?: HTMLElement) {
    return this.scrollable.attachBorderListeners(setClassOn);
  }

  protected onContentUpdate() {
    if(this.scrollable) {
      this.scrollable.onAdditionalScroll();
    }
  }

  public show() {
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
    if(this.destroyed || !this.navigationItem) {
      return;
    }

    appNavigationController.backByItem(this.navigationItem);
  }

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
    }, 150);
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
