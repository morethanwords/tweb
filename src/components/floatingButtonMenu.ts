import contextMenuController from '@helpers/contextMenuController';
import {getOverlayRoot} from '@helpers/appWindow';
import {FloatingMenuDirection, positionFloatingMenu} from '@helpers/positionMenu';
import {doubleRaf} from '@helpers/schedulers';

export type FloatingButtonMenuDirection = FloatingMenuDirection;

export type AttachFloatingButtonMenuOptions = {
  element: HTMLElement;
  triggerEvent: keyof HTMLElementEventMap;
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
  let opened = false;
  let hovered = false;
  let requestId = 0;

  const listener = (): void => void (async() => {
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
      !hovered ||
      !canOpen()
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
    contextMenuController.addAdditionalMenu(menu, element, level, onClose);
  })();

  const onMouseLeave = () => {
    hovered = false;
    ++requestId;
  };

  element.addEventListener(triggerEvent, listener);
  if(triggerEvent === 'mouseenter') {
    element.addEventListener('mouseleave', onMouseLeave);
  }

  return () => {
    element.removeEventListener(triggerEvent, listener);
    element.removeEventListener('mouseleave', onMouseLeave);
  };
}
