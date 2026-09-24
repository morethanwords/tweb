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

// `T` carries the menu-specific fields its owner puts on every one of its buttons
// (DialogsContextMenu's community mode, and the like) straight through to the result
type CreateSubmenuTriggerArgs<T> = {
  options: Pick<ButtonMenuItemOptionsVerifiable, 'text' | 'regularText' | 'icon' | 'verify' | 'separator' | 'separatorDown' | 'onClose'> & T;
  createSubmenu: (args: CreateSubmenuArgs) => MaybePromise<HTMLElement>;
  direction?: FloatingButtonMenuDirection;
};

export default function createSubmenuTrigger<T = {}>({
  options,
  createSubmenu,
  direction = 'right-start'
}: CreateSubmenuTriggerArgs<T>) {
  let
    isDisabled = false,
    currentMiddleware: MiddlewareHelper,
    detachTriggerListeners: () => void
  ;

  const onOpen = () => {
    if(!menuBtnOptions.element) return;
    // Menu item nodes are reused by several context-menu implementations.
    // Re-opening must replace the prior hover/keyboard listeners instead of
    // stacking another async submenu creator on the same trigger.
    detachTriggerListeners?.();
    currentMiddleware?.destroy();
    currentMiddleware = getMiddleware();

    const stopPropagation = (e: Event) => {
      e.stopPropagation();
    };
    menuBtnOptions.element.addEventListener(CLICK_EVENT_NAME, stopPropagation, true);
    menuBtnOptions.element.classList.add('submenu-trigger');
    menuBtnOptions.element.setAttribute('aria-haspopup', 'menu');
    menuBtnOptions.element.setAttribute('aria-expanded', 'false');

    const detachFloatingMenu = attachFloatingButtonMenu({
      element: menuBtnOptions.element,
      direction,
      createMenu: async() => {
        const menu = await createSubmenu({middleware: currentMiddleware.get()});
        menu.classList.add('btn-menu-submenu');
        return menu;
      },
      offset: [-5, -5],
      level: 2,
      triggerEvent: 'mouseenter',
      canOpen: () => !isDisabled,
      onClose: onClose
    });
    detachTriggerListeners = () => {
      menuBtnOptions.element?.removeEventListener(CLICK_EVENT_NAME, stopPropagation, true);
      detachFloatingMenu();
    };
  };

  const onClose = async() => {
    currentMiddleware?.destroy();
    // Prevents hover from triggering when the menu is closing
    isDisabled = true;
    await pause(200);
    isDisabled = false;
  };

  const menuBtnOptions: ButtonMenuItemOptionsVerifiable & T = {
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
    keepOpen: true,
    onOpen,
    onClose,
    dispose: () => {
      detachTriggerListeners?.();
      detachTriggerListeners = undefined;
      currentMiddleware?.destroy();
      currentMiddleware = undefined;
    },
    id: submenuHelperIdSeed++
  };

  delete menuBtnOptions.text;

  return menuBtnOptions;
}
