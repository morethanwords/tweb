import {createRoot} from 'solid-js';
import {createButtonMenuSelect} from '@components/buttonMenuSelect';
import {CLICK_EVENT_NAME} from '@helpers/dom/clickEvent';

vi.mock('@components/emoticonsDropdown/tabs/SuperStickerRenderer', () => ({
  default: class SuperStickerRenderer {}
}));

function dispatchMenuClick(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent(CLICK_EVENT_NAME, {bubbles: true}));
  if(CLICK_EVENT_NAME !== 'click') {
    element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  }
}

describe('button menu select', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  test('keeps searchable single menus open for search and closes on an option', async() => {
    vi.spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const onValueChange = vi.fn();
    let dispose: () => void;
    const select = createRoot((disposeRoot) => {
      dispose = disposeRoot;
      return createButtonMenuSelect<string>({
        class: 'test-button-menu-select',
        direction: 'top-right',
        onValueChange,
        optionKey: (option) => option,
        optionSearchText: (option) => option,
        options: ['Visual Basic', 'JavaScript'],
        renderOption: ({option}) => option,
        single: true,
        value: []
      });
    });

    await select.open(trigger);
    const menu = document.querySelector<HTMLElement>('.test-button-menu-select');
    const input = menu.querySelector<HTMLInputElement>('.btn-menu-item-input');
    const scrollable = menu.querySelector<HTMLElement>('.btn-menu-search-scrollable');
    expect(menu.classList.contains('active')).toBe(true);
    expect(scrollable.style.height).toBe('74px');

    dispatchMenuClick(input);
    expect(menu.classList.contains('active')).toBe(true);

    input.value = 'visualbasic';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));
    const optionItems = menu.querySelectorAll<HTMLElement>(
      '.btn-menu-item:not(.btn-menu-search)'
    );
    expect(Array.from(optionItems).map((item) => item.textContent)).toEqual(['Visual Basic']);
    expect(scrollable.style.height).toBe('42px');

    dispatchMenuClick(optionItems[0]);
    expect(onValueChange).toHaveBeenCalledWith(['Visual Basic']);
    expect(menu.classList.contains('active')).toBe(false);

    dispose();
    expect(menu.isConnected).toBe(false);
  });

  test('cancels an opening menu when its owner is disposed', async() => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const trigger = document.createElement('button');
    document.body.append(trigger);
    let dispose: () => void;
    const select = createRoot((disposeRoot) => {
      dispose = disposeRoot;
      return createButtonMenuSelect<string>({
        direction: 'top-right',
        onValueChange: () => {},
        optionKey: (option) => option,
        options: ['JavaScript'],
        renderOption: ({option}) => option,
        single: true,
        value: []
      });
    });

    const opening = select.open(trigger);
    dispose();
    while(animationFrames.length) animationFrames.shift()(0);
    await opening;

    expect(document.querySelector('.btn-menu-select')).toBeNull();
  });

  test('renders one static No results row when search has no matches', async() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const onValueChange = vi.fn();
    let dispose: () => void;
    const select = createRoot((disposeRoot) => {
      dispose = disposeRoot;
      return createButtonMenuSelect<string>({
        direction: 'top-right',
        emptyText: 'No results',
        onValueChange,
        optionKey: (option) => option,
        optionSearchText: (option) => option,
        options: ['JavaScript'],
        renderOption: ({option}) => option,
        single: true,
        value: []
      });
    });

    await select.open(trigger);
    const menu = document.querySelector<HTMLElement>('.btn-menu-select');
    const input = menu.querySelector<HTMLInputElement>('.btn-menu-item-input');
    const scrollable = menu.querySelector<HTMLElement>('.btn-menu-search-scrollable');
    input.value = 'missing-language';
    input.dispatchEvent(new InputEvent('input', {bubbles: true}));

    const rows = menu.querySelectorAll<HTMLElement>(
      '.btn-menu-item:not(.btn-menu-search)'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toBe('No results');
    expect(rows[0].classList.contains('is-static')).toBe(true);
    expect(rows[0].getAttribute('aria-disabled')).toBe('true');
    expect(scrollable.style.height).toBe('42px');
    expect(onValueChange).not.toHaveBeenCalled();

    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    dispatchMenuClick(rows[0]);
    expect(document.activeElement).toBe(input);
    expect(menu.classList.contains('active')).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();

    dispose();
  });
});
