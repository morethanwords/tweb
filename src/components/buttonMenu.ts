/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import flatten from '../helpers/array/flatten';
import contextMenuController from '../helpers/contextMenuController';
import cancelEvent from '../helpers/dom/cancelEvent';
import {AttachClickOptions, attachClickEvent} from '../helpers/dom/clickEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import ListenerSetter from '../helpers/listenerSetter';
import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import CheckboxField from './checkboxField';
import {Document} from '../layer';
import wrapPhoto from './wrappers/photo';
import textToSvgURL from '../helpers/textToSvgURL';
import customProperties from '../helpers/dom/customProperties';
import {IS_MOBILE} from '../environment/userAgent';
import ripple from './ripple';

export type ButtonMenuItemOptions = {
  icon?: string,
  iconDoc?: Document.document,
  text?: LangPackKey,
  textArgs?: FormatterArguments,
  regularText?: Parameters<typeof setInnerHTML>[1],
  onClick: (e: MouseEvent | TouchEvent) => any,
  checkForClose?: () => boolean,
  element?: HTMLElement,
  textElement?: HTMLElement,
  options?: AttachClickOptions,
  checkboxField?: CheckboxField,
  noCheckboxClickListener?: boolean,
  keepOpen?: boolean,
  separator?: boolean | HTMLElement,
  multiline?: boolean,
  loadPromise?: Promise<any>,
  waitForAnimation?: boolean
  /* , cancelEvent?: true */
};

export type ButtonMenuItemOptionsVerifiable = ButtonMenuItemOptions & {
  verify?: () => boolean | Promise<boolean>
};

function ButtonMenuItem(options: ButtonMenuItemOptions) {
  if(options.element) return [options.separator as HTMLElement, options.element].filter(Boolean);

  const {icon, iconDoc, text, onClick, checkboxField, noCheckboxClickListener} = options;
  const el = document.createElement('div');
  el.className = 'btn-menu-item rp-overflow' + (icon ? ' tgico-' + icon : '');

  if(IS_MOBILE) {
    ripple(el);
  }

  let textElement = options.textElement;
  if(!textElement) {
    textElement = options.textElement = text ? i18n(text, options.textArgs) : document.createElement('span');
    if(options.regularText) {
      setInnerHTML(textElement, options.regularText);
    }
  }

  if(iconDoc) {
    const iconElement = document.createElement('span');
    iconElement.classList.add('btn-menu-item-icon');
    el.append(iconElement);

    options.loadPromise = wrapPhoto({
      container: iconElement,
      photo: iconDoc,
      boxWidth: 24,
      boxHeight: 24,
      withoutPreloader: true,
      noFadeIn: true,
      noBlur: true,
      processUrl: (url) => {
        return fetch(url)
        .then((response) => response.text())
        .then((text) => {
          const color = customProperties.getProperty(document.documentElement.classList.contains('is-mobile') ? 'secondary-text-color' : 'primary-text-color');
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const svg = doc.firstElementChild as HTMLElement;
          svg.querySelectorAll('path').forEach((path) => {
            path.setAttributeNS(null, 'fill', color);
            path.style.stroke = color;
            path.style.strokeWidth = '.25px';
          });
          return textToSvgURL(svg.outerHTML);
        });
      }
    }).then((ret) => ret.loadPromises.thumb);
  }

  textElement.classList.add('btn-menu-item-text');
  el.append(textElement);

  const keepOpen = !!checkboxField || !!options.keepOpen;

  // * cancel mobile keyboard close
  onClick && attachClickEvent(el, /* CLICK_EVENT_NAME !== 'click' || keepOpen ? */ /* async */(e) => {
    cancelEvent(e);

    const menu = findUpClassName(e.target, 'btn-menu');
    if(menu && !menu.classList.contains('active')) {
      return;
    }

    // let closed = false;
    // if(!keepOpen && !options.checkForClose) {
    //   closed = true;
    //   contextMenuController.close();
    // }

    // wait for closing animation
    // if(options.waitForAnimation && rootScope.settings.animationsEnabled && !options.checkForClose) {
    //   await pause(125);
    // }

    onClick(e);
    if(options.checkForClose?.() === false) {
      return;
    }

    if(!keepOpen/*  && !closed */) {
      contextMenuController.close();
    }

    if(checkboxField && !noCheckboxClickListener/*  && result !== false */) {
      checkboxField.checked = checkboxField.input.type === 'radio' ? true : !checkboxField.checked;
    }
  }/*  : onClick */, options.options);

  if(checkboxField) {
    el.append(checkboxField.label);
  }

  if(options.separator === true) {
    options.separator = document.createElement('hr');
  }

  if(options.multiline) {
    el.classList.add('is-multiline');
  }

  return [options.separator as HTMLElement, options.element = el].filter(Boolean);
}

export function ButtonMenuSync({listenerSetter, buttons}: {
  buttons: ButtonMenuItemOptions[],
  listenerSetter?: ListenerSetter
}) {
  const el: HTMLElement = document.createElement('div');
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
  el.append(...flatten(items));

  return el;
}

export default async function ButtonMenu(options: Parameters<typeof ButtonMenuSync>[0]) {
  const el = ButtonMenuSync(options);
  await Promise.all(options.buttons.map(({loadPromise}) => loadPromise));
  return el;
}
