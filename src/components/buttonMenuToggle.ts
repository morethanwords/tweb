/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import contextMenuController from '../helpers/contextMenuController';
import cancelEvent from '../helpers/dom/cancelEvent';
import {AttachClickOptions, CLICK_EVENT_NAME, hasMouseMovedSinceDown} from '../helpers/dom/clickEvent';
import ListenerSetter from '../helpers/listenerSetter';
import ButtonIcon from './buttonIcon';
import ButtonMenu, {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import filterAsync from '../helpers/array/filterAsync';
import {doubleRaf} from '../helpers/schedulers';
import callbackify from '../helpers/callbackify';

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
      contextMenuController.close();
    } else {
      const result = onOpen?.(e);
      const open = () => {
        const openedMenu = el.querySelector('.btn-menu') as HTMLDivElement;
        if(!openedMenu) {
          return;
        }

        contextMenuController.openBtnMenu(openedMenu, onClose);
      };

      callbackify(result, open);
    }
  });
}

export function filterButtonMenuItems(buttons: ButtonMenuItemOptionsVerifiable[]) {
  return filterAsync(buttons, (button) => button?.verify ? button.verify() ?? false : true);
}

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
  icon = 'more'
}: {
  buttonOptions?: Parameters<typeof ButtonIcon>[1],
  listenerSetter?: ListenerSetter,
  container?: HTMLElement
  direction: 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-left' | 'top-right',
  buttons: ButtonMenuItemOptionsVerifiable[],
  onOpenBefore?: (e: Event) => any,
  onOpen?: (e: Event, element: HTMLElement) => any,
  onClose?: () => void,
  onCloseAfter?: () => void,
  noIcon?: boolean,
  icon?: (string & {}) | Icon
}) {
  if(buttonOptions) {
    buttonOptions.asDiv = true;
  }

  const button = container ?? ButtonIcon(noIcon ? undefined : icon, buttonOptions);
  button.classList.add('btn-menu-toggle');

  const listenerSetter = new ListenerSetter();

  const clearCloseTimeout = () => {
    clearTimeout(closeTimeout);
    closeTimeout = undefined;
  };

  let element: HTMLElement, closeTimeout: number, tempId = 0;
  ButtonMenuToggleHandler({
    el: button,
    onOpen: async(e) => {
      const _tempId = ++tempId;
      await onOpenBefore?.(e);
      if(_tempId !== tempId) return;
      if(closeTimeout) {
        clearCloseTimeout();
        return;
      }

      const filteredButtons = await filterButtonMenuItems(buttons);
      if(_tempId !== tempId) return;
      if(!filteredButtons.length) {
        return;
      }

      const _element = element = await ButtonMenu({
        buttons: filteredButtons,
        listenerSetter
      });
      if(_tempId !== tempId) return;
      _element.classList.add(direction);
      if(direction === 'bottom-center') {
        _element.style.setProperty('--parent-half-width', (container.clientWidth / 2) + 'px');
      }

      await onOpen?.(e, _element);
      if(_tempId !== tempId) return;

      button.append(_element);
      await doubleRaf();
      if(_tempId !== tempId) {
        _element.remove();
      }
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
        element.remove();
      }, 300);
    }
  });

  return button;
}
