import { ripple } from "./ripple";

export type ButtonMenuItemOptions = {icon: string, text: string, onClick: () => void, element?: HTMLElement};

const ButtonMenuItem = (options: ButtonMenuItemOptions) => {
  if(options.element) return options.element;

  const {icon, text, onClick} = options;
  const el = document.createElement('div');
  el.className = 'btn-menu-item tgico-' + icon;
  el.innerText = text;

  ripple(el);
  el.addEventListener('click', onClick);

  return options.element = el;
};

const ButtonMenu = (buttons: ButtonMenuItemOptions[]) => {
  const el = document.createElement('div');
  el.classList.add('btn-menu');

  const items = buttons.map(ButtonMenuItem);

  el.append(...items);

  return el;
};

export default ButtonMenu;