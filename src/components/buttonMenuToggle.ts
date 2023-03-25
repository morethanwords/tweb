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
        contextMenuController.openBtnMenu(openedMenu, onClose);
      };

      if(result instanceof Promise) {
        result.then(open);
      } else {
        open();
      }
    }
  });
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
  onCloseAfter
}: {
  buttonOptions?: Parameters<typeof ButtonIcon>[1],
  listenerSetter?: ListenerSetter,
  container?: HTMLElement
  direction: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right',
  buttons: ButtonMenuItemOptionsVerifiable[],
  onOpenBefore?: (e: Event) => any,
  onOpen?: (e: Event, element: HTMLElement) => any,
  onClose?: () => void,
  onCloseAfter?: () => void
}) {
  if(buttonOptions) {
    buttonOptions.asDiv = true;
  }

  const button = container ?? ButtonIcon('more', buttonOptions);
  button.classList.add('btn-menu-toggle');

  const listenerSetter = new ListenerSetter();

  let element: HTMLElement, closeTimeout: number;
  ButtonMenuToggleHandler({
    el: button,
    onOpen: async(e) => {
      await onOpenBefore?.(e);
      if(closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = undefined;
        return;
      }

      const f = (b: (typeof buttons[0])[]) => filterAsync(b, (button) => button?.verify ? button.verify() ?? false : true);

      const filteredButtons = await f(buttons);
      if(!filteredButtons.length) {
        return;
      }

      const _element = element = await ButtonMenu({
        buttons: filteredButtons,
        listenerSetter
      });
      _element.classList.add(direction);

      await onOpen?.(e, _element);

      button.append(_element);
      await doubleRaf();
    },
    options: {
      listenerSetter: attachListenerSetter
    },
    onClose: () => {
      onClose?.();

      closeTimeout = window.setTimeout(() => {
        onCloseAfter?.();
        closeTimeout = undefined;
        listenerSetter.removeAll();
        buttons.forEach((button) => button.element = undefined);
        element.remove();
      }, 300);
    }
  });

  return button;
}
