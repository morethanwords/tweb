import { cancelEvent, CLICK_EVENT_NAME } from "../helpers/dom";
import ButtonIcon from "./buttonIcon";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import { closeBtnMenu, openBtnMenu } from "./misc";

const ButtonMenuToggle = (options: Partial<{noRipple: true, onlyMobile: true}> = {}, direction: 'bottom-left', buttons: ButtonMenuItemOptions[]) => {
  const button = ButtonIcon('more btn-menu-toggle', options);
  const btnMenu = ButtonMenu(buttons);
  btnMenu.classList.add(direction);
  ButtonMenuToggleHandler(button);
  button.append(btnMenu);
  return button;
};

const ButtonMenuToggleHandler = (el: HTMLElement) => {
  (el as HTMLElement).addEventListener(CLICK_EVENT_NAME, (e) => {
    //console.log('click pageIm');
    if(!el.classList.contains('btn-menu-toggle')) return false;

    //window.removeEventListener('mousemove', onMouseMove);
    const openedMenu = el.querySelector('.btn-menu') as HTMLDivElement;
    cancelEvent(e);

    if(el.classList.contains('menu-open')) {
      closeBtnMenu();
    } else {
      openBtnMenu(openedMenu);
    }
  });
};

export { ButtonMenuToggleHandler };
export default ButtonMenuToggle;