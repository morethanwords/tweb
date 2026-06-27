import ButtonMenu, {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import filterAsync from '@helpers/array/filterAsync';
import callbackify from '@helpers/callbackify';
import contextMenuController from '@helpers/contextMenuController';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware, Middleware} from '@helpers/middleware';
import positionMenu from '@helpers/positionMenu';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {logger} from '@lib/logger';
import {getOverlayRoot} from '@helpers/appWindow';

const log = logger('createContextMenu');

export default function createContextMenu<T extends ButtonMenuItemOptionsVerifiable>({
  buttons,
  findElement,
  listenTo,
  appendTo,
  filterButtons,
  onOpen,
  onClose,
  onCloseAfter,
  onElementReady,
  onOpenBefore,
  listenerSetter: attachListenerSetter,
  middleware,
  listenForClick
}: {
  buttons: T[],
  findElement?: (e: MouseEvent | TouchEvent) => HTMLElement,
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  filterButtons?: (buttons: T[]) => Promise<T[]>,
  onOpen?: (e: Event, target: HTMLElement) => any,
  onClose?: () => any,
  onCloseAfter?: () => any,
  onOpenBefore?: () => any,
  onElementReady?: (element: HTMLElement) => void,
  listenerSetter?: ListenerSetter,
  middleware?: Middleware,
  listenForClick?: boolean
}) {
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
    // Duck-type instead of `instanceof MouseEvent`: the event from a Document PiP window is a
    // pip-realm MouseEvent, which is NOT `instanceof` the main realm's MouseEvent (cross-realm
    // instanceof is always false) — so the native context menu wasn't being suppressed in the pip.
    if('preventDefault' in e) (e as any).preventDefault();
    if(_element && _element.classList.contains('active')) {
      return false;
    }
    if('cancelBubble' in e) (e as any).cancelBubble = true;

    const r = async() => {
      try {
        await onOpen?.(e, target);
      } catch(e) {
        if(e instanceof Error) {
          log.error('Error opening context menu:', e);
        } else {
          log('Opening context menu was blocked, reason:', e);
        }
        onClose?.();
        return;
      }

      const initResult = await init();
      if(!initResult) {
        onClose?.();
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
          onCloseAfter?.();
          destroy();
        }, 300);
      }, target);
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

    await onOpenBefore?.();
    onElementReady?.(_element);

    // Resolve lazily at open time so a context menu opened while the client is popped out lands in
    // the Document PiP window's body (the active overlay realm), not the background tab.
    (appendTo ?? getOverlayRoot()).append(_element);

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
