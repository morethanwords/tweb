/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import contextMenuController from "../helpers/contextMenuController";
import cancelEvent from "../helpers/dom/cancelEvent";
import { AttachClickOptions, attachClickEvent } from "../helpers/dom/clickEvent";
import findUpClassName from "../helpers/dom/findUpClassName";
import ListenerSetter from "../helpers/listenerSetter";
import { FormatterArguments, i18n, LangPackKey } from "../lib/langPack";
import CheckboxField from "./checkboxField";

export type ButtonMenuItemOptions = {
  icon?: string, 
  text?: LangPackKey, 
  textArgs?: FormatterArguments,
  regularText?: string, 
  onClick: (e: MouseEvent | TouchEvent) => void | boolean | any, 
  element?: HTMLElement,
  textElement?: HTMLElement,
  options?: AttachClickOptions,
  checkboxField?: CheckboxField,
  noCheckboxClickListener?: boolean,
  keepOpen?: boolean
  /* , cancelEvent?: true */
};

const ButtonMenuItem = (options: ButtonMenuItemOptions) => {
  if(options.element) return options.element;

  const {icon, text, onClick, checkboxField, noCheckboxClickListener} = options;
  const el = document.createElement('div');
  el.className = 'btn-menu-item rp-overflow' + (icon ? ' tgico-' + icon : '');
  // ripple(el);

  let textElement = options.textElement;
  if(!textElement) {
    textElement = options.textElement = text ? i18n(text, options.textArgs) : document.createElement('span');
    if(options.regularText) textElement.innerHTML = options.regularText;
  }
  
  textElement.classList.add('btn-menu-item-text');
  el.append(textElement);

  const keepOpen = !!checkboxField || !!options.keepOpen;

  // * cancel mobile keyboard close
  onClick && attachClickEvent(el, /* CLICK_EVENT_NAME !== 'click' || keepOpen ? */ (e) => {
    cancelEvent(e);

    const menu = findUpClassName(e.target, 'btn-menu');
    if(menu && !menu.classList.contains('active')) {
      return;
    }
    
    const result = onClick(e);

    if(result === false) {
      return;
    }

    if(!keepOpen) {
      contextMenuController.closeBtnMenu();
    }

    if(checkboxField && !noCheckboxClickListener/*  && result !== false */) {
      checkboxField.checked = checkboxField.input.type === 'radio' ? true : !checkboxField.checked;
    }
  }/*  : onClick */, options.options);

  if(checkboxField) {
    el.append(checkboxField.label);
  }

  return options.element = el;
};

const ButtonMenu = (buttons: ButtonMenuItemOptions[], listenerSetter?: ListenerSetter) => {
  const el = document.createElement('div');
  el.classList.add('btn-menu');

  if(listenerSetter) {
    buttons.forEach((b) => {
      if(b.options) {
        b.options.listenerSetter = listenerSetter;
      } else {
        b.options = {listenerSetter};
      }
    });
  }

  const items = buttons.map(ButtonMenuItem);

  el.append(...items);

  return el;
};

export default ButtonMenu;
