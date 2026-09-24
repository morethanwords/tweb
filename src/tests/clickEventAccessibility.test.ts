import {afterEach, describe, expect, it, vi} from 'vitest';
import ListenerSetter from '@helpers/listenerSetter';

vi.mock('@environment/touchSupport', () => ({default: true}));

import {attachClickEvent, hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';

afterEach(() => {
  document.body.replaceChildren();
});

describe('attachClickEvent accessibility on touch-capable devices', () => {
  it('does not treat trusted keyboard clicks as pointer movement', () => {
    const target = document.createElement('button');

    expect(hasMouseMovedSinceDown({
      type: 'click',
      detail: 0,
      isTrusted: true,
      target
    } as unknown as MouseEvent)).toBe(false);
  });

  it('handles pointer activation once and keyboard or AT click activation', () => {
    const button = document.createElement('button');
    const callback = vi.fn();
    document.body.append(button);

    const detach = attachClickEvent(button, callback);
    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    button.dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));
    expect(callback).toHaveBeenCalledTimes(1);

    button.click();
    expect(callback).toHaveBeenCalledTimes(2);

    detach();
    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    button.click();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('activates a custom role=button with Enter and Space', () => {
    const button = document.createElement('div');
    const callback = vi.fn();
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    document.body.append(button);

    attachClickEvent(button, callback);

    button.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'Enter'}));
    button.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: ' ', repeat: true}));
    button.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: ' '}));

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('removes every registered activation path through ListenerSetter', () => {
    const button = document.createElement('button');
    const callback = vi.fn();
    const listenerSetter = new ListenerSetter();
    document.body.append(button);

    attachClickEvent(button, callback, {listenerSetter});
    listenerSetter.removeAll();

    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
    button.click();
    expect(callback).not.toHaveBeenCalled();
  });

  it('applies once across pointer and keyboard activation paths', () => {
    const button = document.createElement('div');
    const callback = vi.fn();
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    document.body.append(button);

    attachClickEvent(button, callback, {once: true});
    button.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'Enter'}));
    button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
