/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { AttachClickOptions, cancelEvent, CLICK_EVENT_NAME } from "../helpers/dom";
import ListenerSetter from "../helpers/listenerSetter";
import ButtonIcon from "./buttonIcon";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import { closeBtnMenu, openBtnMenu } from "./misc";

const ButtonMenuToggle = (options: Partial<{noRipple: true, onlyMobile: true, listenerSetter: ListenerSetter}> = {}, direction: 'bottom-left' | 'top-left', buttons: ButtonMenuItemOptions[], onOpen?: (e: Event) => void) => {
  const button = ButtonIcon('more btn-menu-toggle', options);

  const btnMenu = ButtonMenu(buttons, options.listenerSetter);
  btnMenu.classList.add(direction);
  ButtonMenuToggleHandler(button, onOpen, options);
  button.append(btnMenu);
  return button;
};

// TODO: refactor for attachClickEvent, because if move finger after touchstart, it will start anyway
const ButtonMenuToggleHandler = (el: HTMLElement, onOpen?: (e: Event) => void, options?: AttachClickOptions) => {
  const add = options?.listenerSetter ? options.listenerSetter.add.bind(options.listenerSetter, el) : el.addEventListener.bind(el);

  add(CLICK_EVENT_NAME, (e: Event) => {
    //console.log('click pageIm');
    if(!el.classList.contains('btn-menu-toggle')) return false;

    //window.removeEventListener('mousemove', onMouseMove);
    const openedMenu = el.querySelector('.btn-menu') as HTMLDivElement;
    cancelEvent(e);

    if(el.classList.contains('menu-open')) {
      closeBtnMenu();
    } else {
      onOpen && onOpen(e);
      openBtnMenu(openedMenu);
    }
  });
};

export { ButtonMenuToggleHandler };
export default ButtonMenuToggle;
