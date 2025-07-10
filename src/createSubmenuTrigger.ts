import {ButtonMenuItemOptionsVerifiable} from './components/buttonMenu';
import attachFloatingButtonMenu from './components/floatingButtonMenu';
import Icon from './components/icon';
import {CLICK_EVENT_NAME} from './helpers/dom/clickEvent';
import noop from './helpers/noop';
import pause from './helpers/schedulers/pause';
import {i18n} from './lib/langPack';


let submenuHelperIdSeed = 0;

export default function createSubmenuTrigger(
  options: Pick<ButtonMenuItemOptionsVerifiable, 'text' | 'icon' | 'verify' | 'separator' | 'onClose'>,
  createSubmenu: () => MaybePromise<HTMLElement>
) {
  let isDisabled = false;

  const onOpen = () => {
    if(!menuBtnOptions.element) return;

    menuBtnOptions.element.addEventListener(CLICK_EVENT_NAME, (e) => {
      e.stopPropagation();
    }, true);
    menuBtnOptions.element.classList.add('submenu-trigger');

    attachFloatingButtonMenu({
      element: menuBtnOptions.element,
      direction: 'right-start',
      createMenu: createSubmenu,
      offset: [-5, -5],
      level: 2,
      triggerEvent: 'mouseenter',
      canOpen: () => !isDisabled,
      onClose: options.onClose
    });
  };

  const onClose = async() => {
    // Prevents hover from triggering when the menu is closing
    isDisabled = true;
    await pause(200);
    isDisabled = false;
  };

  const menuBtnOptions: ButtonMenuItemOptionsVerifiable = {
    ...options,

    // * fix langpack
    get regularText() {
      const content = document.createElement('span');
      content.classList.add('submenu-label');
      content.append(i18n(options.text), Icon('arrowhead'));
      return content;
    },
    onClick: noop,
    onOpen,
    onClose,
    id: submenuHelperIdSeed++
  };

  delete menuBtnOptions.text;

  return menuBtnOptions;
}
