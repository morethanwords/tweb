import {IntersectionObserverMock} from '@/tests/mocks/intersectionObserver';

if(typeof(window.IntersectionObserver) !== 'function') {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
}

vi.mock('@components/buttonMenu', async() => (
  import('../../../e2e/fixtures/stubs/buttonMenu')
));

vi.mock('@components/createSubmenuTrigger', async() => (
  import('../../../e2e/fixtures/stubs/createSubmenuTrigger')
));

vi.mock('@environment/touchSupport', () => ({default: false}));

vi.mock('@helpers/contextMenuController', () => {
  let closeCurrent: (() => void) | undefined;
  let currentMenu: HTMLElement | undefined;
  let overlay: HTMLElement | undefined;
  return {
    default: {
      addEventListener: (): void => undefined,
      close: () => {
        currentMenu?.classList.remove('active');
        const close = closeCurrent;
        closeCurrent = undefined;
        currentMenu = undefined;
        overlay?.remove();
        overlay = undefined;
        close?.();
      },
      closeMenusByLevel: () => {
        document.querySelectorAll<HTMLElement>('.btn-menu-submenu.active')
        .forEach((menu) => {
          menu.classList.remove('active');
          menu.hidden = true;
        });
      },
      isOpened: () => !!currentMenu,
      openBtnMenu: (
        menu: HTMLElement,
        onClose: () => void
      ) => {
        overlay?.remove();
        overlay = document.createElement('div');
        overlay.className = 'btn-menu-overlay';
        const closeFromOverlay = () => {
          const close = closeCurrent;
          closeCurrent = undefined;
          currentMenu?.classList.remove('active');
          currentMenu = undefined;
          overlay?.remove();
          overlay = undefined;
          close?.();
        };
        overlay.addEventListener('click', closeFromOverlay);
        overlay.addEventListener('touchend', closeFromOverlay);
        document.body.append(overlay);
        currentMenu = menu;
        closeCurrent = onClose;
        menu.classList.add('active', 'was-open');
      },
      removeEventListener: (): void => undefined
    }
  };
});

if(typeof Range.prototype.getBoundingClientRect !== 'function') {
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: {
      configurable: true,
      value: () => new DOMRect()
    },
    getClientRects: {
      configurable: true,
      value: (): DOMRectList => [] as unknown as DOMRectList
    }
  });
}

if(!('getClientRects' in Text.prototype)) {
  Object.defineProperty(Text.prototype, 'getClientRects', {
    configurable: true,
    value: (): DOMRectList => [] as unknown as DOMRectList
  });
}
