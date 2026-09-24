import {afterEach, expect, it, vi} from 'vitest';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';

let dispose: () => void;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it('moves real focus through lazy picker items and activates only on Enter or Space', async() => {
  const list = document.createElement('div');
  const input = document.createElement('input');
  document.body.append(list, input);
  const click = vi.fn();
  list.addEventListener('click', click);
  dispose = attachPickerGrid(list, '.choice', (item) => item.textContent);
  const items = ['🙂', '👋', '🦆'].map((text) => {
    const item = document.createElement('span');
    item.className = 'choice';
    item.textContent = text;
    list.append(item);
    return item;
  });
  await Promise.resolve();
  expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);
  items[0].focus();
  items[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
  expect(document.activeElement).toBe(items[1]);
  expect(click).not.toHaveBeenCalled();
  items[1].dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true}));
  expect(click).toHaveBeenCalledTimes(1);
  const tab = new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true});
  items[1].dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);
  input.focus();
  const outside = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
  input.dispatchEvent(outside);
  expect(outside.defaultPrevented).toBe(false);
  expect(click).toHaveBeenCalledTimes(1);
});
