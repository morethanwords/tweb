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
import {_i18n, FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import CheckboxField from './checkboxField';
import {Document} from '../layer';
import wrapPhoto from './wrappers/photo';
import textToSvgURL from '../helpers/textToSvgURL';
import customProperties from '../helpers/dom/customProperties';
import {IS_MOBILE} from '../environment/userAgent';
import ripple from './ripple';
import Icon from './icon';
import RadioForm from './radioForm';
import rootScope from '../lib/rootScope';

type ButtonMenuItemInner = Omit<Parameters<typeof ButtonMenuSync>[0], 'listenerSetter'>;
export type ButtonMenuItemOptions = {
  icon?: Icon,
  iconDoc?: Document.document,
  danger?: boolean,
  new?: boolean,
  className?: string,
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
  secondary?: boolean,
  loadPromise?: Promise<any>,
  waitForAnimation?: boolean,
  radioGroup?: string,
  inner?: (() => MaybePromise<ButtonMenuItemInner>) | ButtonMenuItemInner
  /* , cancelEvent?: true */
};

export type ButtonMenuItemOptionsVerifiable = ButtonMenuItemOptions & {
  verify?: () => boolean | Promise<boolean>
};

let addedThemeListener = false;

function ButtonMenuItem(options: ButtonMenuItemOptions) {
  if(options.element) return [options.separator as HTMLElement, options.element].filter(Boolean);

  const {icon, iconDoc, className, text, onClick, checkboxField, noCheckboxClickListener} = options;
  const el = document.createElement('div');
  const iconSplitted = icon?.split(' ');
  el.className = 'btn-menu-item rp-overflow' +
    (iconSplitted?.length > 1 ? ' ' + iconSplitted.slice(1).join(' ') : '') +
    (className ? ' ' + className : '') +
    (options.danger ? ' danger' : '');

  if(IS_MOBILE) {
    ripple(el);
  }

  if(iconSplitted) {
    el.append(Icon(iconSplitted[0] as Icon, 'btn-menu-item-icon'));
  }

  let textElement = options.textElement;
  if(!textElement) {
    textElement = options.textElement = text ? i18n(text, options.textArgs) : document.createElement('span');
    if(options.regularText) {
      setInnerHTML(textElement, options.regularText);
      textElement.dir = '';
    }
  }

  if(iconDoc) {
    const iconElement = document.createElement('span');
    iconElement.classList.add('btn-menu-item-icon', 'is-external');
    el.append(iconElement);

    if(!addedThemeListener) {
      addedThemeListener = true;

      rootScope.addEventListener('theme_changed', () => {
        const elements = document.querySelectorAll<HTMLElement>('.btn-menu-item-icon.is-external');
        elements.forEach((element) => {
          const set = (element as any).set;
          set?.(true);
        });
      });
    }

    const set = async(manual?: boolean) => {
      const isMobile = document.documentElement.classList.contains('is-mobile');
      const svg: SVGSVGElement = (iconElement as any).svg;
      const color = customProperties.getProperty(isMobile ? 'secondary-text-color' : 'primary-text-color');
      svg.querySelectorAll('path').forEach((path) => {
        path.setAttributeNS(null, 'fill', color);
        path.style.stroke = color;
        path.style.strokeWidth = (isMobile ? .625 : .375) + 'px';
      });

      const url = await textToSvgURL(svg.outerHTML);
      if(!manual) {
        return url;
      }

      ((iconElement as any).image as HTMLImageElement).src = url;
    };

    options.loadPromise = wrapPhoto({
      container: iconElement,
      photo: iconDoc,
      boxWidth: 24,
      boxHeight: 24,
      withoutPreloader: true,
      noFadeIn: true,
      noBlur: true,
      processUrl: async(url) => {
        const text = await (await fetch(url)).text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.firstElementChild as HTMLElement;
        (iconElement as any).svg = svg;
        (iconElement as any).set = set;
        return set();
      }
    }).then((ret) => {
      iconElement.style.width = iconElement.style.height = '';
      (iconElement as any).image = ret.images.full;
      return ret.loadPromises.thumb;
    });
  }

  textElement.classList.add('btn-menu-item-text');
  el.append(textElement);

  if(options.new) {
    const badge = document.createElement('span');
    badge.classList.add('btn-menu-item-badge');
    _i18n(badge, 'New');
    el.append(badge);
  }

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

  if(options.secondary) {
    el.classList.add('is-secondary');
    options.multiline = true;
  }

  if(options.multiline) {
    el.classList.add('is-multiline');
  }

  if(options.inner) {
    el.append(Icon('next', 'btn-menu-item-icon', 'btn-menu-item-icon-right'));
    el.classList.add('has-inner');
    (el as any).inner = options.inner;
  }

  return [options.separator as HTMLElement, options.element = el].filter(Boolean);
}

export function ButtonMenuSync({listenerSetter, buttons, radioGroups}: {
  buttons: ButtonMenuItemOptions[],
  radioGroups?: {
    name: string,
    onChange: (value: string, e: Event) => any,
    checked: number // idx
  }[],
  listenerSetter?: ListenerSetter
}) {
  const el: HTMLElement = document.createElement('div');
  el.classList.add('btn-menu');

  if(radioGroups) {
    buttons.forEach((b) => {
      if(!b.radioGroup) {
        return;
      }

      b.checkboxField ??= new CheckboxField();
    });
  }

  if(listenerSetter) {
    buttons.forEach((b) => {
      (b.options ??= {}).listenerSetter = listenerSetter;
    });
  }

  const items = buttons.map(ButtonMenuItem);
  el.append(...flatten(items));

  if(radioGroups) {
    radioGroups.forEach((group) => {
      const elements = buttons.filter((button) => button.radioGroup === group.name);

      const hr = document.createElement('hr');
      elements[0].element.replaceWith(hr);

      const container = RadioForm(elements.map((e, idx) => {
        const input = e.checkboxField.input;
        input.type = 'radio';
        input.name = group.name;
        input.value = '' + +(idx === group.checked);
        input.checked = idx === group.checked;
        return {
          container: e.element,
          input: e.checkboxField.input
        };
      }), group.onChange);

      hr.before(container);
      container.append(hr);
    });
  }

  return el;
}

export default async function ButtonMenu(options: Parameters<typeof ButtonMenuSync>[0]) {
  const el = ButtonMenuSync(options);
  await Promise.all(options.buttons.map(({loadPromise}) => loadPromise));
  return el;
}
