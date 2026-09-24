import I18n, {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import Icon from '@components/icon';
import ripple from '@components/ripple';
import {getIconButtonLabelKey} from '@helpers/dom/iconButtonLabel';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';

export type ButtonOptions = Partial<{
  noRipple: true,
  onlyMobile: true,
  icon: Icon,
  rippleSquare: true,
  text: LangPackKey,
  textArgs?: FormatterArguments,
  ariaLabel: LangPackKey,
  disabled: boolean,
  asDiv: boolean,
  asLink: boolean
}>;

export default function Button<T extends ButtonOptions>(className: string, options: T = {} as T): T['asLink'] extends true ? HTMLAnchorElement : HTMLButtonElement {
  const button = document.createElement(options.asLink ? 'a' : (options.asDiv ? 'div' : 'button'));
  button.className = className;
  if(!options.asLink) ensureButtonSemantics(button);

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

  const ariaLabel = options.ariaLabel || (!options.text && getIconButtonLabelKey(options.icon));
  if(ariaLabel) {
    button.setAttribute('aria-label', I18n.format(ariaLabel, true));
  }

  return button as any;
}

export function replaceButtonIcon(element: HTMLElement, icon: Icon, oldIcon: Element | false = element.querySelector('.button-icon')) {
  const newIcon = Icon(icon, 'button-icon');
  if(oldIcon) oldIcon.replaceWith(newIcon);
  else element.append(newIcon);
  return newIcon;
}
