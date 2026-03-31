import contextMenuController from '@helpers/contextMenuController';
import {
  canMenuFitDirection,
  getMenuLeftPositionForDirection,
  getMenuTopPositionForStartDirection
} from '@helpers/positionMenu';
import {doubleRaf} from '@helpers/schedulers';

export type FloatingButtonMenuDirection = 'right-start' | 'left-start';

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

    document.body.append(menu);

    const actualDirection = getDirection(triggerBcr, menu, direction, offset);
    menu.style.transformOrigin = actualDirection === 'right-start' ? '0 0' : '100% 0';

    const left = getMenuLeftPositionForDirection(triggerBcr, menu, actualDirection === 'right-start' ? 'right' : 'left', offset);
    const top = getMenuTopPositionForStartDirection(triggerBcr, menu, offset);

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

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

const getDirection = (
  triggerBcr: DOMRect,
  menu: HTMLElement,
  direction: FloatingButtonMenuDirection,
  offset: [number, number]
): FloatingButtonMenuDirection => {
  if(direction === 'right-start') {
    return canMenuFitDirection(triggerBcr, menu, 'right', offset) || !canMenuFitDirection(triggerBcr, menu, 'left', offset) ? 'right-start' : 'left-start';
  }

  return canMenuFitDirection(triggerBcr, menu, 'left', offset) || !canMenuFitDirection(triggerBcr, menu, 'right', offset) ? 'left-start' : 'right-start';
};
