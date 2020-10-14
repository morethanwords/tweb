import ButtonIcon from "./buttonIcon";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import { openBtnMenu } from "./misc";

const ButtonMenuToggle = (options: Partial<{noRipple: true, onlyMobile: true}> = {}, direction: 'bottom-left', buttons: ButtonMenuItemOptions[]) => {
  const button = ButtonIcon('more', options);
  const btnMenu = ButtonMenu(buttons);
  btnMenu.classList.add(direction);
  ButtonMenuToggleHandler(button);
  button.append(btnMenu);
  return button;
};

const ButtonMenuToggleHandler = (el: HTMLElement) => {
  (el as HTMLElement).addEventListener('click', (e) => {
    //console.log('click pageIm');
    if(!el.classList.contains('btn-menu-toggle')) return false;

    //window.removeEventListener('mousemove', onMouseMove);
    let openedMenu = el.querySelector('.btn-menu') as HTMLDivElement;
    e.cancelBubble = true;
    //cancelEvent(e);

    if(el.classList.contains('menu-open')) {
      el.classList.remove('menu-open');
      openedMenu.classList.remove('active');
    } else {
      openBtnMenu(openedMenu);
    }
  });
};

export { ButtonMenuToggleHandler };
export default ButtonMenuToggle;