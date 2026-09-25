import type {ButtonMenuItemOptionsVerifiable} from './buttonMenu';

export default function createSubmenuTrigger({
  createSubmenu,
  options
}: {
  createSubmenu: (args: {middleware: () => boolean}) => HTMLElement | Promise<HTMLElement>,
  options: ButtonMenuItemOptionsVerifiable
}) {
  let submenu: HTMLElement | undefined;
  let initialized = false;
  const close = () => {
    if(!submenu) return;
    submenu.classList.remove('active');
    submenu.hidden = true;
  };
  const result: ButtonMenuItemOptionsVerifiable = {
    ...options,
    keepOpen: true,
    onClick: () => undefined,
    onClose: close,
    onOpen: () => {
      const element = result.element;
      if(!element || initialized) return;
      initialized = true;
      element.classList.add('submenu-trigger');
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
        const show = (created: HTMLElement) => {
          submenu = created;
          submenu.classList.add('btn-menu-submenu', 'active');
          submenu.hidden = false;
          document.body.append(submenu);
        };
        const created = createSubmenu({middleware: () => true});
        if(created instanceof Promise) {
          void created.then(show);
        } else {
          show(created);
        }
      });
    }
  };
  return result;
}
