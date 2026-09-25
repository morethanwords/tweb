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

it('puts the single tab stop on the pressed item of a single-choice grid', async() => {
  const list = document.createElement('div');
  document.body.append(list);
  dispose = attachPickerGrid(list, '.choice', (item) => item.textContent);
  const items = ['day', 'night', 'tinted'].map((text) => {
    const item = document.createElement('div');
    item.className = 'choice';
    item.textContent = text;
    item.setAttribute('aria-pressed', String(text === 'night'));
    return item;
  });
  list.append(...items);
  await Promise.resolve();
  expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
});

it('keeps one tab stop and native names on a row of buttons that exists before it is attached', async() => {
  const list = document.createElement('div');
  document.body.append(list);
  const items = ['System', 'Dark', 'Light'].map((text) => {
    const item = document.createElement('button');
    item.textContent = text;
    item.setAttribute('aria-pressed', String(text === 'Dark'));
    list.append(item);
    return item;
  });
  dispose = attachPickerGrid(list, 'button');
  expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  expect(items.some((item) => item.hasAttribute('role') || item.hasAttribute('aria-label'))).toBe(false);

  // a pointer pick moves the choice and the tab stop with it
  items[0].setAttribute('aria-pressed', 'true');
  items[1].setAttribute('aria-pressed', 'false');
  await Promise.resolve();
  expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);

  // while focus is inside, the stop stays where focus is, whatever the choice does
  items[2].focus();
  items[2].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true, cancelable: true}));
  expect(document.activeElement).toBe(items[1]);
  items[0].setAttribute('aria-pressed', 'false');
  items[2].setAttribute('aria-pressed', 'true');
  await Promise.resolve();
  expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
});
