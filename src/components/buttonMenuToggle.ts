import contextMenuController from '@helpers/contextMenuController';
import cancelEvent from '@helpers/dom/cancelEvent';
import {AttachClickOptions, CLICK_EVENT_NAME, hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import ButtonIcon from '@components/buttonIcon';
import ButtonMenu, {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import filterAsync from '@helpers/array/filterAsync';
import {doubleRaf} from '@helpers/schedulers';
import callbackify from '@helpers/callbackify';
import findUpClassName from '@helpers/dom/findUpClassName';
import {MenuPositionPadding, positionMenuTrigger} from '@helpers/positionMenu';
import {getOverlayRoot} from '@helpers/appWindow';

// TODO: refactor for attachClickEvent, because if move finger after touchstart, it will start anyway
export function ButtonMenuToggleHandler({
  el,
  onOpen,
  options,
  onClose
}: {
  el: HTMLElement,
  onOpen?: (e: Event) => any,
  options?: AttachClickOptions,
  onClose?: () => void
}) {
  const add = options?.listenerSetter ? options.listenerSetter.add(el) : el.addEventListener.bind(el);

  add(CLICK_EVENT_NAME, (e: Event) => {
    if(!el.classList.contains('btn-menu-toggle') || hasMouseMovedSinceDown(e)) return false;

    cancelEvent(e);

    if(el.classList.contains('menu-open')) {
      if(e.target && (e.target as HTMLElement).classList.contains('btn-menu')) {
        return;
      }

      contextMenuController.close();
    } else {
      const result = onOpen?.(e);
      const open = (element?: HTMLElement) => {
        const openedMenu = element ?? el.querySelector('.btn-menu') as HTMLDivElement;
        if(!openedMenu) {
          return;
        }

        contextMenuController.openBtnMenu(openedMenu, onClose, el);
      };

      callbackify(result, open);
    }
  });
}

export function filterButtonMenuItems(buttons: ButtonMenuItemOptionsVerifiable[]) {
  return filterAsync(buttons, (button) => button?.verify ? button.verify() ?? false : true);
}

export type ButtonMenuDirection = 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-left' | 'top-right'

export default function ButtonMenuToggle({
  buttonOptions,
  listenerSetter: attachListenerSetter,
  container,
  direction,
  buttons,
  onOpenBefore,
  onOpen,
  onClose,
  onCloseAfter,
  noIcon,
  icon = 'more',
  appendTo,
  positionPadding
}: {
  buttonOptions?: Parameters<typeof ButtonIcon>[1],
  listenerSetter?: ListenerSetter,
  container?: HTMLElement
  appendTo?: HTMLElement,
  direction: ButtonMenuDirection,
  buttons: ButtonMenuItemOptionsVerifiable[],
  onOpenBefore?: (e: Event) => any,
  onOpen?: (e: Event, element: HTMLElement) => any,
  onClose?: () => void,
  onCloseAfter?: () => void,
  noIcon?: boolean,
  icon?: (string & {}) | Icon,
  positionPadding?: MenuPositionPadding
}) {
  if(buttonOptions) {
    buttonOptions.asDiv = true;
  }

  const button = container ?? ButtonIcon(noIcon ? undefined : icon, buttonOptions);
  const autoPosition = !appendTo;
  button.classList.add('btn-menu-toggle');

  const listenerSetter = new ListenerSetter();

  const clearCloseTimeout = () => {
    clearTimeout(closeTimeout);
    closeTimeout = undefined;
  };

  // * fix translation by deleting text elements on close
  const canDeleteTextElementsOnClose = buttons.filter((button) => !button.textElement);
  const previousButtons = buttons.slice();

  let element: HTMLElement, closeTimeout: number, tempId = 0;
  ButtonMenuToggleHandler({
    el: button,
    onOpen: async(e) => {
      const _tempId = ++tempId;
      await onOpenBefore?.(e);
      if(_tempId !== tempId) return;
      if(closeTimeout) {
        clearCloseTimeout();
        if(element?.isConnected) {
          return element;
        }
      }

      const filteredButtons = await filterButtonMenuItems(buttons);
      if(_tempId !== tempId) return;
      if(!filteredButtons.length) {
        return;
      }

      const newButtons = filteredButtons.slice().filter((button) => !previousButtons.includes(button));
      previousButtons.push(...newButtons);
      canDeleteTextElementsOnClose.push(...newButtons.filter((button) => !button.textElement));

      const _element = element = await ButtonMenu({
        buttons: filteredButtons,
        listenerSetter
      });
      if(_tempId !== tempId) return;
      _element.classList.add(direction);
      if(direction === 'bottom-center') {
        _element.style.setProperty('--parent-half-width', ((container ?? button).clientWidth / 2) + 'px');
      }

      await onOpen?.(e, _element);
      if(_tempId !== tempId) return;

      // Resolve the mount lazily so a menu opened while the client is popped out lands in the active
      // window's body (the Document PiP window), not the background tab.
      (appendTo ?? getOverlayRoot()).append(_element);
      if(autoPosition) {
        positionMenuTrigger(button, _element, direction, positionPadding ?? {top: 8, bottom: 8});
      }
      await doubleRaf();
      if(_tempId !== tempId) {
        _element.remove();
      }

      return _element
    },
    options: {
      listenerSetter: attachListenerSetter
    },
    onClose: () => {
      ++tempId;
      clearCloseTimeout();
      onClose?.();

      closeTimeout = window.setTimeout(() => {
        onCloseAfter?.();
        closeTimeout = undefined;
        listenerSetter.removeAll();
        buttons.forEach((button) => {
          try {button.dispose?.();} catch{}
          button.element = undefined;
        });
        canDeleteTextElementsOnClose.forEach((button) => delete button.textElement);
        element.remove();
      }, 300);
    }
  });

  return button;
}
