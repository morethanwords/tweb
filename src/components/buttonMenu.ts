import { attachClickEvent, AttachClickOptions, cancelEvent, CLICK_EVENT_NAME } from "../helpers/dom";
import ListenerSetter from "../helpers/listenerSetter";
import { closeBtnMenu } from "./misc";
import { ripple } from "./ripple";

export type ButtonMenuItemOptions = {
  icon: string, 
  text: string, 
  onClick: (e: MouseEvent | TouchEvent) => void, 
  element?: HTMLElement,
  options?: AttachClickOptions
  /* , cancelEvent?: true */
};

const ButtonMenuItem = (options: ButtonMenuItemOptions) => {
  if(options.element) return options.element;

  const {icon, text, onClick} = options;
  const el = document.createElement('div');
  el.className = 'btn-menu-item tgico-' + icon;
  el.innerText = text;

  ripple(el);

  // * cancel keyboard close
  attachClickEvent(el, CLICK_EVENT_NAME !== 'click' ? (e) => {
    cancelEvent(e);
    onClick(e);
    closeBtnMenu();
  } : onClick, options.options);

  return options.element = el;
};

const ButtonMenu = (buttons: ButtonMenuItemOptions[], listenerSetter?: ListenerSetter) => {
  const el = document.createElement('div');
  el.classList.add('btn-menu');

  if(listenerSetter) {
    buttons.forEach(b => {
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