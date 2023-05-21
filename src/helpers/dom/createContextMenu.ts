/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ButtonMenu, {ButtonMenuItemOptionsVerifiable} from '../../components/buttonMenu';
import filterAsync from '../array/filterAsync';
import callbackify from '../callbackify';
import contextMenuController from '../contextMenuController';
import ListenerSetter from '../listenerSetter';
import {getMiddleware, Middleware} from '../middleware';
import positionMenu from '../positionMenu';
import {attachContextMenuListener} from './attachContextMenuListener';
import {attachClickEvent} from './clickEvent';

export default function createContextMenu<T extends ButtonMenuItemOptionsVerifiable>({
  buttons,
  findElement,
  listenTo,
  appendTo,
  filterButtons,
  onOpen,
  onClose,
  onBeforeOpen,
  listenerSetter: attachListenerSetter,
  middleware,
  listenForClick
}: {
  buttons: T[],
  findElement?: (e: MouseEvent | TouchEvent) => HTMLElement,
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  filterButtons?: (buttons: T[]) => Promise<T[]>,
  onOpen?: (target: HTMLElement) => any,
  onClose?: () => any,
  onBeforeOpen?: () => any,
  listenerSetter?: ListenerSetter,
  middleware?: Middleware,
  listenForClick?: boolean
}) {
  appendTo ??= document.body;

  attachListenerSetter ??= new ListenerSetter();
  const listenerSetter = new ListenerSetter();
  const middlewareHelper = middleware ? middleware.create() : getMiddleware();
  let element: HTMLElement;

  const open = (e: MouseEvent | TouchEvent) => {
    const target = findElement ? findElement(e as any) : listenTo;
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

      target.classList.add('menu-open');

      _element = initResult.element;
      const {cleanup, destroy} = initResult;

      positionMenu(e, _element);
      contextMenuController.openBtnMenu(_element, () => {
        target.classList.remove('menu-open');
        onClose?.();
        cleanup();

        setTimeout(() => {
          destroy();
        }, 300);
      });
    };

    r();
  };

  attachContextMenuListener({
    element: listenTo,
    callback: open,
    listenerSetter: attachListenerSetter
  });

  const cleanup = () => {
    listenerSetter.removeAll();
    middlewareHelper.clean();
  };

  const destroy = () => {
    cleanup();
    attachListenerSetter.removeAll();
  };

  const init = async() => {
    cleanup();

    buttons.forEach((button) => button.element = undefined);
    const f = filterButtons || ((buttons: T[]) => filterAsync(buttons, (button) => {
      return button?.verify ? callbackify(button.verify(), (result) => result ?? false) : true;
    }));

    const filteredButtons = await f(buttons);
    if(!filteredButtons.length) {
      return;
    }

    const _element = element = await ButtonMenu({
      buttons: filteredButtons,
      listenerSetter
    });
    _element.classList.add('contextmenu');

    await onBeforeOpen?.();

    appendTo.append(_element);

    return {
      element: _element,
      cleanup,
      destroy: () => {
        _element.remove();
      }
    };
  };

  if(middleware) {
    middleware.onDestroy(() => {
      destroy();
    });
  }

  if(listenForClick) {
    attachClickEvent(listenTo, open, {listenerSetter: attachListenerSetter});
  }

  return {element, destroy, open};
}
