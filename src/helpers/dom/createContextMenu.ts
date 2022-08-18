/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ButtonMenu, {ButtonMenuItemOptions} from '../../components/buttonMenu';
import filterAsync from '../array/filterAsync';
import contextMenuController from '../contextMenuController';
import ListenerSetter from '../listenerSetter';
import {getMiddleware} from '../middleware';
import positionMenu from '../positionMenu';
import {attachContextMenuListener} from './attachContextMenuListener';

export default function createContextMenu<T extends ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>}>({
  buttons,
  findElement,
  listenTo,
  appendTo,
  filterButtons,
  onOpen,
  onClose
}: {
  buttons: T[],
  findElement: (e: MouseEvent) => HTMLElement,
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  filterButtons?: (buttons: T[]) => Promise<T[]>,
  onOpen?: (target: HTMLElement) => any,
  onClose?: () => any
}) {
  appendTo ??= document.body;

  const attachListenerSetter = new ListenerSetter();
  const listenerSetter = new ListenerSetter();
  const middleware = getMiddleware();
  let element: HTMLElement;

  attachContextMenuListener(listenTo, (e) => {
    const target = findElement(e as any);
    if(!target) {
      return;
    }

    let _element = element;
    if(e instanceof MouseEvent || e.hasOwnProperty('preventDefault')) (e as any).preventDefault();
    if(_element && _element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent || e.hasOwnProperty('cancelBubble')) (e as any).cancelBubble = true;

    const r = async() => {
      await onOpen?.(target);

      const initResult = await init();
      if(!initResult) {
        return;
      }

      _element = initResult.element;
      const {cleanup, destroy} = initResult;

      positionMenu(e, _element);
      contextMenuController.openBtnMenu(_element, () => {
        onClose?.();
        cleanup();

        setTimeout(() => {
          destroy();
        }, 300);
      });
    };

    r();
  }, attachListenerSetter);

  const cleanup = () => {
    listenerSetter.removeAll();
    middleware.clean();
  };

  const destroy = () => {
    cleanup();
    attachListenerSetter.removeAll();
  };

  const init = async() => {
    cleanup();

    buttons.forEach((button) => button.element = undefined);
    const f = filterButtons || ((buttons: T[]) => filterAsync(buttons, (button) => button?.verify?.() ?? true));

    const filteredButtons = await f(buttons);
    if(!filteredButtons.length) {
      return;
    }

    const _element = element = ButtonMenu(filteredButtons, listenerSetter);
    _element.classList.add('contextmenu');

    appendTo.append(_element);

    return {
      element: _element,
      cleanup,
      destroy: () => {
        _element.remove();
      }
    };
  };

  return {element, destroy};
}
