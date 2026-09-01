import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn()
}));

vi.mock('@helpers/contextMenuController', () => ({
  default: {close: mocks.close}
}));
vi.mock('@environment/userAgent', () => ({IS_MOBILE: false}));
vi.mock('@components/avatarNew', () => ({AvatarNew: vi.fn()}));
vi.mock('@components/icon', () => ({
  default: () => document.createElement('span')
}));
vi.mock('@components/putPreloader', () => ({
  putPreloader: () => document.createElement('span')
}));
vi.mock('@components/ripple', () => ({default: vi.fn()}));
vi.mock('@components/wrappers/attachBotIcon', () => ({default: vi.fn()}));
vi.mock('@lib/langPack', () => ({
  _i18n: vi.fn(),
  i18n: () => document.createElement('span')
}));
vi.mock('@components/checkboxField', () => ({
  default: class {
    public input = document.createElement('input');
    public label = document.createElement('span');

    constructor() {
      this.input.type = 'checkbox';
      this.label.append(this.input);
    }

    get checked() {
      return this.input.checked;
    }

    set checked(checked: boolean) {
      this.input.checked = checked;
      this.input.dispatchEvent(new Event('change'));
    }
  }
}));

import {ButtonMenuSync} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';
import ListenerSetter from '@helpers/listenerSetter';

function pressKey(element: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key});
  element.dispatchEvent(event);
  return event;
}

describe('ButtonMenu keyboard accessibility', () => {
  beforeEach(() => {
    mocks.close.mockClear();
  });

  it('uses ordinary button semantics and activates action rows with Enter and Space', () => {
    const listenerSetter = new ListenerSetter();
    const onClick = vi.fn();
    const menu = ButtonMenuSync({
      listenerSetter,
      buttons: [{regularText: 'Heading', onClick: undefined}, {regularText: 'Open', onClick}]
    });
    menu.classList.add('active');
    const [heading, item] = menu.querySelectorAll<HTMLElement>('.btn-menu-item');

    expect(menu.getAttribute('role')).toBeNull();
    expect(heading.getAttribute('role')).toBeNull();
    expect(heading.tabIndex).toBe(-1);
    expect(item.getAttribute('role')).toBe('button');
    expect(item.tabIndex).toBe(0);

    expect(pressKey(item, 'Enter').defaultPrevented).toBe(true);
    expect(pressKey(item, ' ').defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(mocks.close).toHaveBeenCalledTimes(2);

    listenerSetter.removeAll();
    pressKey(item, 'Enter');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('labels native checkboxes and routes keyboard activation through the existing action', () => {
    const checkboxField = new CheckboxField();
    const onClick = vi.fn();
    const menu = ButtonMenuSync({
      buttons: [{checkboxField, regularText: 'Toggle', onClick}]
    });
    menu.classList.add('active');
    const item = menu.querySelector<HTMLElement>('.btn-menu-item');

    expect(item.getAttribute('role')).toBeNull();
    expect(item.tabIndex).toBe(-1);
    expect(checkboxField.input.tabIndex).toBe(0);
    expect(checkboxField.input.getAttribute('aria-labelledby'))
      .toBe(item.querySelector('.btn-menu-item-text').id);

    expect(pressKey(checkboxField.input, ' ').defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(checkboxField.checked).toBe(true);
  });

  it('labels native radios and preserves both click and change behavior from the keyboard', () => {
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const onChange = vi.fn();
    const menu = ButtonMenuSync({
      buttons: [{
        radioGroup: 'quality',
        regularText: 'First',
        onClick: firstClick
      }, {
        radioGroup: 'quality',
        regularText: 'Second',
        onClick: secondClick
      }],
      radioGroups: [{name: 'quality', checked: 0, onChange}]
    });
    menu.classList.add('active');
    const items = menu.querySelectorAll<HTMLElement>('.btn-menu-item');
    const inputs = menu.querySelectorAll<HTMLInputElement>('input');

    expect(inputs[0].type).toBe('radio');
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);

    expect(items[0].getAttribute('role')).toBeNull();
    expect(items[1].getAttribute('role')).toBeNull();
    expect(items[0].tabIndex).toBe(-1);
    expect(items[1].tabIndex).toBe(-1);
    expect(inputs[0].tabIndex).toBe(0);
    expect(inputs[1].tabIndex).toBe(0);
    expect(inputs[0].getAttribute('aria-labelledby'))
      .toBe(items[0].querySelector('.btn-menu-item-text').id);
    expect(inputs[1].getAttribute('aria-labelledby'))
      .toBe(items[1].querySelector('.btn-menu-item-text').id);

    pressKey(inputs[1], 'Enter');
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).toHaveBeenCalledTimes(1);
    expect(inputs[0].checked).toBe(false);
    expect(inputs[1].checked).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    expect(pressKey(inputs[1], 'ArrowLeft').defaultPrevented).toBe(true);
    expect(firstClick).toHaveBeenCalledTimes(1);
    expect(secondClick).toHaveBeenCalledTimes(1);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
