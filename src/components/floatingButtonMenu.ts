import contextMenuController from '@helpers/contextMenuController';
import {doubleRaf} from '@helpers/schedulers';


export type FloatingButtonMenuDirection = 'right-start' | 'left-start'; // Add other directions as necessary

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

const offsetFromWindowMargin = 16;

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
  const listener = (): void => void (async() => {
    if(opened || !canOpen()) return;
    opened = true;

    const triggerBcr = element.getBoundingClientRect();

    let menu: HTMLElement;
    try {
      menu = await createMenu();
    } catch{}

    if(!menu) {
      opened = false;
      onCloseArg?.();
      return;
    }

    const onClose = async() => {
      opened = false;
      onCloseArg?.();
    };

    document.body.append(menu);


    if(direction === 'right-start') {
      menu.style.transformOrigin = '0 0';

      const left = getLeftPositionForRightDirection(triggerBcr, menu, offset, offsetFromWindowMargin);
      const top = getTopPositionForStartDirection(triggerBcr, menu, offset, offsetFromWindowMargin);

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    } else if(direction === 'left-start') {
      menu.style.transformOrigin = '100% 0';

      const left = getLeftPositionForLeftDirection(triggerBcr, menu, offset, offsetFromWindowMargin);
      const top = getTopPositionForStartDirection(triggerBcr, menu, offset, offsetFromWindowMargin);

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }

    await doubleRaf();
    contextMenuController.addAdditionalMenu(menu, element, level, onClose);
  })();

  element.addEventListener(triggerEvent, listener);

  return () => {
    element.removeEventListener(triggerEvent, listener);
  };
}

const getTopPositionForStartDirection = (triggerBcr: DOMRect, menu: HTMLElement, offset: [number, number], offsetFromWindowMargin: number) => {
  let top = triggerBcr.top + offset[1];
  const bottom = top + menu.clientHeight;
  if(bottom + offsetFromWindowMargin > window.innerHeight) top -= bottom - window.innerHeight + offsetFromWindowMargin;
  top = Math.max(top, offsetFromWindowMargin);

  return top;
};

const getLeftPositionForRightDirection = (triggerBcr: DOMRect, menu: HTMLElement, offset: [number, number], offsetFromWindowMargin: number) => {
  let left = triggerBcr.right + offset[0];
  const right = left + menu.clientWidth; // cannot use .getBoundingClientRect as it has scale
  if(right + offsetFromWindowMargin > window.innerWidth) left -= right - window.innerWidth + offsetFromWindowMargin;

  return left;
};

const getLeftPositionForLeftDirection = (triggerBcr: DOMRect, menu: HTMLElement, offset: [number, number], offsetFromWindowMargin: number) => {
  const right = triggerBcr.left - offset[0];
  let left = right - menu.clientWidth;
  if(left - offsetFromWindowMargin < 0) left = offsetFromWindowMargin;

  return left;
};
