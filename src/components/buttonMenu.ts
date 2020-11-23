import { cancelEvent, CLICK_EVENT_NAME } from "../helpers/dom";
import { closeBtnMenu } from "./misc";
import { ripple } from "./ripple";

export type ButtonMenuItemOptions = {icon: string, text: string, onClick: (e: MouseEvent | TouchEvent) => void, element?: HTMLElement/* , cancelEvent?: true */};

const ButtonMenuItem = (options: ButtonMenuItemOptions) => {
  if(options.element) return options.element;

  const {icon, text, onClick} = options;
  const el = document.createElement('div');
  el.className = 'btn-menu-item tgico-' + icon;
  el.innerText = text;

  ripple(el);
  /* if(options.cancelEvent) {
    el.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      closeBtnMenu();
      options.onClick(e);
    });
  } else {
    el.addEventListener(CLICK_EVENT_NAME, onClick);
  } */
  if(CLICK_EVENT_NAME == 'touchend') { // * cancel keyboard close
    el.addEventListener(CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      options.onClick(e);
      closeBtnMenu();
    });
  } else {
    el.addEventListener(CLICK_EVENT_NAME, onClick);
  }

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