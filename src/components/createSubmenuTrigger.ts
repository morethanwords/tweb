import {CLICK_EVENT_NAME} from '@helpers/dom/clickEvent';
import {getMiddleware, Middleware, MiddlewareHelper} from '@helpers/middleware';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import {i18n} from '@lib/langPack';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import attachFloatingButtonMenu, {FloatingButtonMenuDirection} from '@components/floatingButtonMenu';
import Icon from '@components/icon';


let submenuHelperIdSeed = 0;

export type CreateSubmenuArgs = {
  middleware: Middleware;
};

type CreateSubmenuTriggerArgs = {
  options: Pick<ButtonMenuItemOptionsVerifiable, 'text' | 'regularText' | 'icon' | 'verify' | 'separator' | 'separatorDown' | 'onClose'>;
  createSubmenu: (args: CreateSubmenuArgs) => MaybePromise<HTMLElement>;
  direction?: FloatingButtonMenuDirection;
};

export default function createSubmenuTrigger({
  options,
  createSubmenu,
  direction = 'right-start'
}: CreateSubmenuTriggerArgs) {
  let
    isDisabled = false,
    currentMiddleware: MiddlewareHelper
  ;

  const onOpen = () => {
    if(!menuBtnOptions.element) return;
    currentMiddleware = getMiddleware();

    menuBtnOptions.element.addEventListener(CLICK_EVENT_NAME, (e) => {
      e.stopPropagation();
    }, true);
    menuBtnOptions.element.classList.add('submenu-trigger');

    attachFloatingButtonMenu({
      element: menuBtnOptions.element,
      direction,
      createMenu: () => createSubmenu({middleware: currentMiddleware.get()}),
      offset: [-5, -5],
      level: 2,
      triggerEvent: 'mouseenter',
      canOpen: () => !isDisabled,
      onClose: options.onClose
    });
  };

  const onClose = async() => {
    currentMiddleware?.destroy();
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
      const text = document.createElement('span');
      text.classList.add('submenu-label-text');
      text.append(options.regularText ?? i18n(options.text));
      content.append(text, Icon('arrowhead'));
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
