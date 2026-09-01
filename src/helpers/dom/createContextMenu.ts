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

type ContextMenuEvent = MouseEvent | TouchEvent;
type ContextMenuInstance = {
  element: HTMLElement,
  cleanup: () => void,
  destroy: () => void
};

export default function createContextMenu<T extends ButtonMenuItemOptionsVerifiable>({
  buttons,
  findElement,
  listenTo,
  appendTo,
  resolveAppendTo,
  filterButtons,
  onOpen,
  onClose,
  onCloseAfter,
  onElementReady,
  onOpenBefore,
  onOpenAfter,
  listenerSetter: attachListenerSetter,
  middleware,
  listenForClick,
  position,
  reopenOnTrigger,
  cancelOnOpenFalse
}: {
  buttons: T[],
  findElement?: (e: MouseEvent | TouchEvent) => HTMLElement,
  listenTo: HTMLElement,
  appendTo?: HTMLElement,
  resolveAppendTo?: () => HTMLElement,
  filterButtons?: (buttons: T[]) => Promise<T[]>,
  onOpen?: (e: Event, target: HTMLElement) => any,
  onClose?: () => any,
  onCloseAfter?: () => any,
  onOpenBefore?: () => any,
  onOpenAfter?: (element: HTMLElement, target: HTMLElement) => any,
  onElementReady?: (element: HTMLElement) => void,
  listenerSetter?: ListenerSetter,
  middleware?: Middleware,
  listenForClick?: boolean,
  position?: (e: ContextMenuEvent, element: HTMLElement, target: HTMLElement) => void,
  reopenOnTrigger?: boolean,
  cancelOnOpenFalse?: boolean
}) {
  attachListenerSetter ??= new ListenerSetter();
  const instances = new Set<ContextMenuInstance>();
  let element: HTMLElement;
  let destroyed = false;
  let openGeneration = 0;

  const open = (e: ContextMenuEvent) => {
    if(destroyed) return;
    const target = findElement ? findElement(e as any) : listenTo;
    if(!target) {
      return;
    }

    let _element = element;
    const generation = ++openGeneration;
    // Duck-type instead of `instanceof MouseEvent`: the event from a Document PiP window is a
    // pip-realm MouseEvent, which is NOT `instanceof` the main realm's MouseEvent (cross-realm
    // instanceof is always false) — so the native context menu wasn't being suppressed in the pip.
    if('preventDefault' in e) (e as any).preventDefault();
    if(_element && _element.classList.contains('active')) {
      if(!reopenOnTrigger) return false;
      contextMenuController.close();
      _element = undefined;
    }
    if('cancelBubble' in e) (e as any).cancelBubble = true;

    const isCurrent = () => !destroyed && generation === openGeneration;
    const r = async() => {
      try {
        const openResult = await onOpen?.(e, target);
        if((cancelOnOpenFalse && openResult === false) || !isCurrent()) {
          onClose?.();
          return;
        }
      } catch(e) {
        if(e instanceof Error) {
          log.error('Error opening context menu:', e);
        } else {
          log('Opening context menu was blocked, reason:', e);
        }
        onClose?.();
        return;
      }

      let initResult: Awaited<ReturnType<typeof init>>;
      try {
        initResult = await init(isCurrent);
      } catch(e) {
        log.error('Error creating context menu:', e);
        onClose?.();
        return;
      }
      if(!initResult || !isCurrent()) {
        initResult?.destroy();
        onClose?.();
        return;
      }

      target.classList.add('menu-open');

      _element = initResult.element;
      element = _element;
      const {cleanup, destroy} = initResult;

      if(position) {
        position(e, _element, target);
      } else {
        positionMenu(e, _element);
      }

      contextMenuController.openBtnMenu(_element, () => {
        target.classList.remove('menu-open');
        onClose?.();
        cleanup();

        setTimeout(() => {
          onCloseAfter?.();
          destroy();
        }, 300);
      }, target);
      onOpenAfter?.(_element, target);
    };

    return r();
  };

  attachContextMenuListener({
    element: listenTo,
    callback: open,
    listenerSetter: attachListenerSetter
  });

  const destroy = () => {
    if(destroyed) return;
    destroyed = true;
    ++openGeneration;
    if(element?.classList.contains('active')) {
      contextMenuController.close();
    }
    attachListenerSetter.removeAll();
    [...instances].forEach((instance) => instance.destroy());
    element = undefined;
  };

  const close = () => {
    if(destroyed) return;
    ++openGeneration;
    if(element?.classList.contains('active')) {
      contextMenuController.close();
    }
  };

  const init = async(isCurrent: () => boolean): Promise<ContextMenuInstance | undefined> => {
    buttons.forEach((button) => button.element = undefined);
    const f = filterButtons || ((buttons: T[]) => filterAsync(buttons, (button) => {
      return button?.verify ? callbackify(button.verify(), (result) => result ?? false) : true;
    }));

    const filteredButtons = await f(buttons);
    if(!isCurrent() || !filteredButtons.length) {
      return;
    }

    const listenerSetter = new ListenerSetter();
    const middlewareHelper = middleware ? middleware.create() : getMiddleware();
    let _element: HTMLElement;
    const disposeUnpublished = () => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
      _element?.remove();
    };

    try {
      _element = await ButtonMenu({
        buttons: filteredButtons,
        listenerSetter
      });
      if(!isCurrent()) {
        disposeUnpublished();
        return;
      }
      _element.classList.add('contextmenu');

      await onOpenBefore?.();
      if(!isCurrent()) {
        disposeUnpublished();
        return;
      }
      onElementReady?.(_element);

      // Resolve lazily at open time so a context menu opened while the client is popped out lands in
      // the Document PiP window's body (the active overlay realm), not the background tab.
      (resolveAppendTo?.() ?? appendTo ?? getOverlayRoot()).append(_element);
    } catch(err) {
      disposeUnpublished();
      throw err;
    }

    let cleaned = false;
    let instanceDestroyed = false;
    const cleanup = () => {
      if(cleaned) return;
      cleaned = true;
      listenerSetter.removeAll();
      middlewareHelper.clean();
    };
    const instance: ContextMenuInstance = {
      element: _element,
      cleanup,
      destroy: () => {
        if(instanceDestroyed) return;
        instanceDestroyed = true;
        listenerSetter.removeAll();
        middlewareHelper.destroy();
        _element.remove();
        instances.delete(instance);
        if(element === _element) element = undefined;
      }
    };
    instances.add(instance);
    return instance;
  };

  if(middleware) {
    middleware.onDestroy(() => {
      destroy();
    });
  }

  if(listenForClick) {
    attachClickEvent(listenTo, open, {listenerSetter: attachListenerSetter});
  }

  return {
    get element() {
      return element;
    },
    close,
    destroy,
    open
  };
}
