import contextMenuController from '@helpers/contextMenuController';
import Modes from '@config/modes';
import {getOverlayRoot} from '@helpers/appWindow';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {FloatingMenuDirection, positionFloatingMenu} from '@helpers/positionMenu';
import {doubleRaf} from '@helpers/schedulers';

export type FloatingButtonMenuDirection = FloatingMenuDirection;

export type AttachFloatingButtonMenuOptions = {
  element: HTMLElement;
  triggerEvent: keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap>;
  direction: FloatingButtonMenuDirection;
  level: number;
  offset?: [number, number];
  createMenu: () => HTMLElement | Promise<HTMLElement>;
  canOpen?: () => boolean;
  onClose?: () => void;
};

export default function attachFloatingButtonMenu({
  element,
  triggerEvent,
  direction,
  level,
  offset = [0, 0],
  createMenu,
  canOpen = () => true,
  onClose: onCloseArg
}: AttachFloatingButtonMenuOptions) {
  const triggerEvents = Array.isArray(triggerEvent) ? triggerEvent : [triggerEvent];
  let opened = false;
  let hovered = false;
  let requestId = 0;

  const listener = (event?: Event): void => void (async() => {
    const activatedWithKeyboard = event?.type === 'keydown' ||
      (event?.type === 'click' && (event as MouseEvent).detail === 0);
    hovered = true;
    if(opened || !canOpen()) return;
    const currentRequestId = ++requestId;

    const triggerBcr = element.getBoundingClientRect();

    let menu: HTMLElement;
    try {
      menu = await createMenu();
    } catch{}

    if(
      !menu ||
      opened ||
      currentRequestId !== requestId ||
      (!hovered && !activatedWithKeyboard) ||
      !canOpen() ||
      !contextMenuController.isOpened()
    ) {
      return;
    }

    opened = true;

    const onClose = async() => {
      opened = false;
      onCloseArg?.();
    };

    getOverlayRoot().append(menu);

    positionFloatingMenu(triggerBcr, menu, direction, offset);

    await doubleRaf();
    if(currentRequestId !== requestId || !contextMenuController.isOpened()) {
      opened = false;
      menu.remove();
      return;
    }

    contextMenuController.addAdditionalMenu(menu, element, level, onClose, activatedWithKeyboard);
  })();

  const onMouseLeave = () => {
    hovered = false;
    ++requestId;
  };

  triggerEvents.forEach((event) => element.addEventListener(event, listener));
  const hoverTriggered = triggerEvents.includes('mouseenter');
  // a menu that opens on hover opens on activation too, unless a click already opens it
  const detachActivation = Modes.a11y && hoverTriggered && !triggerEvents.includes('click') ?
    attachClickEvent(element, listener) :
    undefined;
  if(hoverTriggered) {
    element.addEventListener('mouseleave', onMouseLeave);
    if(Modes.a11y) element.addEventListener('keydown', onKeyDown);
  }

  return () => {
    ++requestId;
    triggerEvents.forEach((event) => element.removeEventListener(event, listener));
    element.removeEventListener('mouseleave', onMouseLeave);
    element.removeEventListener('keydown', onKeyDown);
    detachActivation?.();
  };

  function onKeyDown(e: KeyboardEvent) {
    if(e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    listener(e);
  }
}
