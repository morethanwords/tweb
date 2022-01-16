/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { i18n, LangPackKey } from "../lib/langPack";
import { ripple } from "./ripple";

export type ButtonOptions = Partial<{
  noRipple: true, 
  onlyMobile: true, 
  icon: string, 
  rippleSquare: true, 
  text: LangPackKey, 
  disabled: boolean,
  asDiv: boolean
}>;

const Button = (className: string, options: ButtonOptions = {}) => {
  const button: HTMLButtonElement = document.createElement(options.asDiv ? 'div' : 'button') as any;
  button.className = className + (options.icon ? ' tgico-' + options.icon : '');

  if(!options.noRipple) {
    if(options.rippleSquare) {
      button.classList.add('rp-square');
    }

    ripple(button);
  }

  if(options.onlyMobile) {
    button.classList.add('only-handhelds');
  }

  if(options.disabled) {
    button.setAttribute('disabled', 'true');
  }

  if(options.text) {
    button.append(i18n(options.text));
  }

  return button;
};

export default Button;
