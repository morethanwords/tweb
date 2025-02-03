import contextMenuController from '../helpers/contextMenuController';
import {doubleRaf} from '../helpers/schedulers';

export type AttachFloatingButtonMenuOptions = {
  element: HTMLElement;
  triggerEvent: keyof HTMLElementEventMap;
  direction: 'right-start'; // Add other directions as necessary
  offset?: [number, number];
  createMenu: () => HTMLElement | Promise<HTMLElement>;
}

export default function attachFloatingButtonMenu({
  element,
  triggerEvent,
  direction,
  offset = [0, 0],
  createMenu
}: AttachFloatingButtonMenuOptions) {
  let opened = false;
  const listener = () => {
    (async() => {
      if(opened) return;
      opened = true;

      const triggerBcr = element.getBoundingClientRect();

      const menu = await createMenu();

      const onClose = async() => {
        opened = false;
      }

      document.body.append(menu);

      const menuBcr = menu.getBoundingClientRect();

      if(direction === 'right-start') {
        menu.style.transformOrigin = '0 0';
        let left = triggerBcr.right + offset[0];
        const right = left + menuBcr.width;
        if(right > window.innerWidth) left -= right - window.innerWidth;

        let top = triggerBcr.top + offset[1];
        const bottom = top + menuBcr.height;
        if(bottom > window.innerHeight) top -= bottom - window.innerHeight;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      }

      await doubleRaf();
      contextMenuController.addAdditionalMenu(menu, element, onClose);
    })();
  };

  element.addEventListener(triggerEvent, listener);

  return () => {
    element.removeEventListener(triggerEvent, listener);
  }
}
