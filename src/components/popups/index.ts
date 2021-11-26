/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../../lib/rootScope";
import { ripple } from "../ripple";
import animationIntersector from "../animationIntersector";
import appNavigationController, { NavigationItem } from "../appNavigationController";
import { i18n, LangPackKey } from "../../lib/langPack";
import findUpClassName from "../../helpers/dom/findUpClassName";
import blurActiveElement from "../../helpers/dom/blurActiveElement";
import ListenerSetter from "../../helpers/listenerSetter";
import { attachClickEvent, simulateClickEvent } from "../../helpers/dom/clickEvent";
import isSendShortcutPressed from "../../helpers/dom/isSendShortcutPressed";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import getKeyFromEvent from "../../helpers/dom/getKeyFromEvent";
import EventListenerBase from "../../helpers/eventListenerBase";

export type PopupButton = {
  text?: string,
  callback?: () => void,
  langKey?: LangPackKey,
  langArgs?: any[],
  isDanger?: true,
  isCancel?: true,
  element?: HTMLButtonElement
};

export type PopupOptions = Partial<{
  closable: true, 
  overlayClosable: true, 
  withConfirm: LangPackKey | true, 
  body: true,
  confirmShortcutIsSendShortcut: boolean
}>;

export default class PopupElement extends EventListenerBase<{
  close: () => void,
  closeAfterTimeout: () => void
}> {
  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');
  protected btnClose: HTMLElement;
  protected btnConfirm: HTMLButtonElement;
  protected body: HTMLElement;
  protected buttonsEl: HTMLElement;

  protected onEscape: () => boolean = () => true;

  protected navigationItem: NavigationItem;

  protected listenerSetter: ListenerSetter;

  protected confirmShortcutIsSendShortcut: boolean;
  protected btnConfirmOnEnter: HTMLButtonElement;

  constructor(className: string, protected buttons?: Array<PopupButton>, options: PopupOptions = {}) {
    super(false);

    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');
    this.title.classList.add('popup-title');

    this.header.append(this.title);

    this.listenerSetter = new ListenerSetter();

    this.confirmShortcutIsSendShortcut = options.confirmShortcutIsSendShortcut;

    if(options.closable) {
      this.btnClose = document.createElement('span');
      this.btnClose.classList.add('btn-icon', 'popup-close', 'tgico-close');
      //ripple(this.closeBtn);
      this.header.prepend(this.btnClose);

      attachClickEvent(this.btnClose, this.hide, {listenerSetter: this.listenerSetter, once: true});
    }

    if(options.overlayClosable) {
      attachClickEvent(this.element, (e: MouseEvent) => {
        if(!findUpClassName(e.target, 'popup-container')) {
          this.hide();
        }
      }, {listenerSetter: this.listenerSetter});
    }

    if(options.withConfirm) {
      this.btnConfirm = document.createElement('button');
      this.btnConfirm.classList.add('btn-primary', 'btn-color-primary');
      if(options.withConfirm !== true) {
        this.btnConfirm.append(i18n(options.withConfirm));
      }
      this.header.append(this.btnConfirm);
      ripple(this.btnConfirm);
    }

    this.container.append(this.header);
    if(options.body) {
      this.body = document.createElement('div');
      this.body.classList.add('popup-body');
      this.container.append(this.body);
    }

    let btnConfirmOnEnter = this.btnConfirm;
    if(buttons && buttons.length) {
      const buttonsDiv = this.buttonsEl = document.createElement('div');
      buttonsDiv.classList.add('popup-buttons');

      if(buttons.length === 2) {
        buttonsDiv.classList.add('popup-buttons-row');
      }
      
      const buttonsElements = buttons.map(b => {
        const button = document.createElement('button');
        button.className = 'btn' + (b.isDanger ? ' danger' : ' primary');
        
        ripple(button);
        
        if(b.text) {
          button.innerHTML =  b.text;
        } else {
          button.append(i18n(b.langKey, b.langArgs));
        }
        
        attachClickEvent(button, () => {
          b.callback && b.callback();
          this.destroy();
        }, {listenerSetter: this.listenerSetter, once: true});
        
        return b.element = button;
      });
      
      if(!btnConfirmOnEnter && buttons.length === 2) {
        const button = buttons.find(button => !button.isCancel);
        if(button) {
          btnConfirmOnEnter = button.element;
        }
      }

      buttonsDiv.append(...buttonsElements);
      this.container.append(buttonsDiv);
    }

    this.btnConfirmOnEnter = btnConfirmOnEnter;

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
    rootScope.isOverlayActive = true;
    animationIntersector.checkAnimations(true);

    // cannot add event instantly because keydown propagation will fire it
    setTimeout(() => {
      this.listenerSetter.add(document.body)('keydown', (e) => {
        if(this.confirmShortcutIsSendShortcut ? isSendShortcutPressed(e) : getKeyFromEvent(e) === 'Enter') {
          simulateClickEvent(this.btnConfirmOnEnter);
          cancelEvent(e);
        }
      });
    }, 0);
  }

  public hide = () => {
    appNavigationController.back('popup');
  };

  private destroy = () => {
    this.dispatchEvent('close');
    this.element.classList.add('hiding');
    this.element.classList.remove('active');
    this.listenerSetter.removeAll();

    rootScope.isOverlayActive = false;

    appNavigationController.removeItem(this.navigationItem);
    this.navigationItem = undefined;

    setTimeout(() => {
      this.element.remove();
      this.dispatchEvent('closeAfterTimeout');
      this.cleanup();
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
