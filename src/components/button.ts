import { i18n, LangPackKey } from "../lib/langPack";
import { ripple } from "./ripple";

const Button = (className: string, options: Partial<{noRipple: true, onlyMobile: true, icon: string, rippleSquare: true, text: LangPackKey, disabled: boolean}> = {}) => {
  const button = document.createElement('button');
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
    button.disabled = true;
  }

  if(options.text) {
    button.append(i18n(options.text));
  }

  return button;
};

export default Button;
