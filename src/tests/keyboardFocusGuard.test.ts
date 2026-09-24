import {expect, it} from 'vitest';
import {shouldPreserveKeyboardFocus} from '@helpers/dom/isKeyboardControl';

function keyOn(target: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', {key});
  Object.defineProperty(event, 'target', {value: target});
  return event;
}

it('reserves native scrolling keys for a focused reading region', () => {
  const region = document.createElement('div');
  region.className = 'scrollable';
  region.tabIndex = 0;
  for(const key of ['ArrowUp', 'PageDown', 'Home', ' ']) {
    expect(shouldPreserveKeyboardFocus(keyOn(region, key))).toBe(true);
  }
});

it('does not mistake the scrollable message editor for a reading region', () => {
  const editor = document.createElement('div');
  editor.className = 'input-message-input scrollable';
  editor.tabIndex = 0;
  Object.defineProperty(editor, 'isContentEditable', {value: true});
  // The chat shortcut handler must still receive ArrowUp to edit the previous
  // message; that handler separately protects text inputs outside the composer.
  expect(shouldPreserveKeyboardFocus(keyOn(editor, 'ArrowUp'))).toBe(false);
  expect(shouldPreserveKeyboardFocus(keyOn(editor, 'Tab'))).toBe(true);
});

it('continues to leave native control activation to the focused button', () => {
  const button = document.createElement('button');
  expect(shouldPreserveKeyboardFocus(keyOn(button, ' '))).toBe(true);
  expect(shouldPreserveKeyboardFocus(keyOn(button, 'Enter'))).toBe(true);
});

it('treats a stand-in link the way it treats a native one', () => {
  // A custom element with no href has to carry the role instead. If the guard
  // did not know that role, keys pressed on it would be redirected into the
  // composer while the same keys on an `<a href>` are left alone — the archive
  // row in the chat list is exactly that shape.
  const link = document.createElement('div');
  link.setAttribute('role', 'link');
  expect(shouldPreserveKeyboardFocus(keyOn(link, 'Enter'))).toBe(true);
  expect(shouldPreserveKeyboardFocus(keyOn(link, 'a'))).toBe(true);
});
