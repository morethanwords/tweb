/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import Icon from './icon';
import ripple from './ripple';

export type ButtonOptions = Partial<{
  noRipple: true,
  onlyMobile: true,
  icon: Icon,
  rippleSquare: true,
  text: LangPackKey,
  textArgs?: FormatterArguments,
  disabled: boolean,
  asDiv: boolean,
  asLink: boolean
}>;

export default function Button<T extends ButtonOptions>(className: string, options: T = {} as T): T['asLink'] extends true ? HTMLAnchorElement : HTMLButtonElement {
  const button = document.createElement(options.asLink ? 'a' : (options.asDiv ? 'div' : 'button'));
  button.className = className;

  if(!options.noRipple) {
    if(options.rippleSquare) {
      button.classList.add('rp-square');
    }

    ripple(button);
  }

  if(options.icon) {
    replaceButtonIcon(button, options.icon, false);
  }

  if(options.onlyMobile) {
    button.classList.add('only-handhelds');
  }

  if(options.disabled) {
    button.setAttribute('disabled', 'true');
  }

  if(options.text) {
    button.append(i18n(options.text, options.textArgs));
  }

  return button as any;
}

export function replaceButtonIcon(element: HTMLElement, icon: Icon, oldIcon: Element | false = element.querySelector('.button-icon')) {
  const newIcon = Icon(icon, 'button-icon');
  if(oldIcon) oldIcon.replaceWith(newIcon);
  else element.append(newIcon);
  return newIcon;
}
