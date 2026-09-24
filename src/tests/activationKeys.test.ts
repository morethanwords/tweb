import {expect, it, vi} from 'vitest';
import buttonKeyDown, {linkKeyDown} from '@helpers/solid/buttonKeyDown';

function press(element: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', {key, cancelable: true});
  Object.defineProperty(event, 'target', {value: element});
  return event;
}

function stub(role: string) {
  const element = document.createElement('div');
  element.setAttribute('role', role);
  element.tabIndex = 0;
  const click = vi.fn();
  element.click = click;
  return {element, click};
}

/*
 * The two helpers differ in one thing, and it is the thing that matters: a
 * button answers to Enter AND Space, a link answers to Enter alone. On a link
 * Space belongs to the scroll — taking it costs a page-down to whoever is
 * reading the list the link sits in, which is why the archive row in the chat
 * list uses `linkKeyDown` and not the easier `buttonKeyDown`.
 */
it('a stand-in button activates on Enter and on Space', () => {
  const {element, click} = stub('button');

  const enter = press(element, 'Enter');
  buttonKeyDown(enter, element);
  expect(click).toHaveBeenCalledTimes(1);
  expect(enter.defaultPrevented).toBe(true);

  const space = press(element, ' ');
  buttonKeyDown(space, element);
  expect(click).toHaveBeenCalledTimes(2);
  expect(space.defaultPrevented).toBe(true);
});

it('a stand-in link activates on Enter and leaves Space to the scroll', () => {
  const {element, click} = stub('link');

  const enter = press(element, 'Enter');
  linkKeyDown(enter, element);
  expect(click).toHaveBeenCalledTimes(1);
  expect(enter.defaultPrevented).toBe(true);

  const space = press(element, ' ');
  linkKeyDown(space, element);
  expect(click).toHaveBeenCalledTimes(1);
  expect(space.defaultPrevented).toBe(false);
});

it('neither one fires on a native control, which activates itself', () => {
  const anchor = document.createElement('a');
  anchor.href = '#somewhere';
  const click = vi.fn();
  anchor.click = click;

  linkKeyDown(press(anchor, 'Enter'), anchor);
  buttonKeyDown(press(anchor, 'Enter'), anchor);
  expect(click).not.toHaveBeenCalled();
});

it('ignores a key that is only passing through on its way somewhere else', () => {
  const {element, click} = stub('link');

  const repeated = press(element, 'Enter');
  Object.defineProperty(repeated, 'repeat', {value: true});
  linkKeyDown(repeated, element);

  const handled = press(element, 'Enter');
  handled.preventDefault();
  linkKeyDown(handled, element);

  const fromAChild = new KeyboardEvent('keydown', {key: 'Enter', cancelable: true});
  Object.defineProperty(fromAChild, 'target', {value: document.createElement('span')});
  linkKeyDown(fromAChild, element);

  expect(click).not.toHaveBeenCalled();
});
