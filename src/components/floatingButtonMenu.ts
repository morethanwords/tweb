import contextMenuController from '../helpers/contextMenuController';
import {doubleRaf} from '../helpers/schedulers';

export type AttachFloatingButtonMenuOptions = {
  element: HTMLElement;
  triggerEvent: keyof HTMLElementEventMap;
  direction: 'right-start'; // Add other directions as necessary
  level: number;
  offset?: [number, number];
  createMenu: () => HTMLElement | Promise<HTMLElement>;
  canOpen?: () => boolean;
}

export default function attachFloatingButtonMenu({
  element,
  triggerEvent,
  direction,
  level,
  offset = [0, 0],
  createMenu,
  canOpen = () => true
}: AttachFloatingButtonMenuOptions) {
  let opened = false;
  const listener = () => {
    (async() => {
      if(opened || !canOpen()) return;
      opened = true;

      const triggerBcr = element.getBoundingClientRect();

      const menu = await createMenu();

      const onClose = async() => {
        opened = false;
      }

      document.body.append(menu);

      const OFFSET_FROM_WINDOW_MARGIN_PX = 16;

      if(direction === 'right-start') {
        menu.style.transformOrigin = '0 0';
        let left = triggerBcr.right + offset[0];
        const right = left + menu.clientWidth; // cannot use .getBoundingClientRect as it has scale
        if(right + OFFSET_FROM_WINDOW_MARGIN_PX > window.innerWidth) left -= right - window.innerWidth + OFFSET_FROM_WINDOW_MARGIN_PX;

        let top = triggerBcr.top + offset[1];
        const bottom = top + menu.clientHeight;
        if(bottom + OFFSET_FROM_WINDOW_MARGIN_PX > window.innerHeight) top -= bottom - window.innerHeight + OFFSET_FROM_WINDOW_MARGIN_PX;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      }

      await doubleRaf();
      contextMenuController.addAdditionalMenu(menu, element, level, onClose);
    })();
  };

  element.addEventListener(triggerEvent, listener);

  return () => {
    element.removeEventListener(triggerEvent, listener);
  };
}
