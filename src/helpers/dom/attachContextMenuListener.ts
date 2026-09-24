import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_APPLE} from '@environment/userAgent';
import contextMenuController from '@helpers/contextMenuController';
import ListenerSetter, {ListenerOptions} from '@helpers/listenerSetter';
import cancelEvent from '@helpers/dom/cancelEvent';

let _cancelContextMenuOpening = false, _cancelContextMenuOpeningTimeout = 0;
export function cancelContextMenuOpening() {
  if(_cancelContextMenuOpeningTimeout) {
    clearTimeout(_cancelContextMenuOpeningTimeout);
  }

  _cancelContextMenuOpeningTimeout = window.setTimeout(() => {
    _cancelContextMenuOpeningTimeout = 0;
    _cancelContextMenuOpening = false;
  }, .4e3);

  _cancelContextMenuOpening = true;
}

export function attachContextMenuListener({
  element,
  callback,
  listenerSetter,
  listenerOptions
}: {
  element: HTMLElement,
  callback: (e: TouchEvent | MouseEvent) => void,
  listenerSetter?: ListenerSetter,
  listenerOptions?: ListenerOptions
}) {
  const add = listenerSetter ? listenerSetter.add(element) : element.addEventListener.bind(element);
  const remove = listenerSetter ? listenerSetter.removeManual.bind(listenerSetter, element) : element.removeEventListener.bind(element);

  add('keydown', (event: KeyboardEvent) => {
    if(event.defaultPrevented || event.repeat ||
      event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const target = event.target as HTMLElement;
    if(target.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = target.getBoundingClientRect();
    const win = target.ownerDocument.defaultView;
    target.dispatchEvent(new win.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    }));
  });

  // can't cancel further events coming after 'contextmenu' event
  if((IS_APPLE && IS_TOUCH_SUPPORTED) || listenerOptions) {
    // The keyboard path above also exists on touch-capable devices. Their
    // long-press listener must not swallow the synthetic contextmenu event.
    add('contextmenu', (event: MouseEvent) => {
      if(!event.isTrusted && event.button === 0) callback(event);
    }, listenerOptions);
    let timeout: number;

    const options: EventListenerOptions = {
      ...(listenerOptions || {}),
      capture: true
    };

    const onCancel = () => {
      clearTimeout(timeout);
      // @ts-ignore
      remove('touchmove', onCancel, options);
      // @ts-ignore
      remove('touchend', onCancel, options);
      // @ts-ignore
      remove('touchcancel', onCancel, options);
    };

    add('touchstart', (e: TouchEvent) => {
      if(e.touches.length > 1) {
        onCancel();
        return;
      }

      add('touchmove', onCancel, options);
      add('touchend', onCancel, options);
      add('touchcancel', onCancel, options);

      timeout = window.setTimeout(() => {
        if(_cancelContextMenuOpening) {
          onCancel();
          return;
        }

        callback(e);
        onCancel();

        if(contextMenuController.isOpened()) {
          add('touchend', cancelEvent, {once: true}); // * fix instant closing
        }
      }, .4e3);
    }, listenerOptions);

    /* if(!isSafari) {
      add('contextmenu', (e: any) => {
        cancelEvent(e);
      }, {passive: false, capture: true});
    } */
  } else {
    add('contextmenu', IS_TOUCH_SUPPORTED ? (e: any) => {
      callback(e);

      if(contextMenuController.isOpened()) {
        add('touchend', cancelEvent, {once: true}); // * fix instant closing
      }
    } : callback, listenerOptions);
  }
}
