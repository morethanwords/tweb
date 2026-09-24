import {afterEach, expect, it} from 'vitest';
import createFocusTrap, {getFocusableElements} from '@helpers/dom/focusTrap';
import {setAppWindow} from '@helpers/appWindow';

const mounted: HTMLElement[] = [];

afterEach(() => {
  setAppWindow(window);
  mounted.splice(0).forEach((element) => element.remove());
});

it('retains focus and traps Tab after an open dialog is adopted into another app window and back', async() => {
  const iframe = document.createElement('iframe');
  const trigger = document.createElement('button');
  const dialog = document.createElement('div');
  const first = document.createElement('button');
  const last = document.createElement('button');
  dialog.append(first, last);
  document.body.append(iframe, trigger, dialog);
  mounted.push(iframe, trigger, dialog);
  [first, last].forEach(makeVisible);
  trigger.focus();
  const trap = createFocusTrap(dialog);
  trap.activate();
  last.focus();

  setAppWindow(iframe.contentWindow);
  iframe.contentDocument.body.append(trigger, dialog);
  await Promise.resolve();
  expect(iframe.contentDocument.activeElement).toBe(last);
  last.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
  expect(iframe.contentDocument.activeElement).toBe(first);

  setAppWindow(window);
  document.body.append(trigger, dialog);
  await Promise.resolve();
  expect(document.activeElement).toBe(first);
  first.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
  expect(document.activeElement).toBe(last);
  trap.deactivate();
  expect(document.activeElement).toBe(trigger);
});

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    value: 1
  });
}

it('traps and restores focus in the container ownerDocument', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  mounted.push(iframe);

  const targetDocument = iframe.contentDocument;
  const trigger = targetDocument.createElement('button');
  const dialog = targetDocument.createElement('div');
  const first = targetDocument.createElement('button');
  const last = targetDocument.createElement('button');
  dialog.append(first, last);
  targetDocument.body.append(trigger, dialog);
  makeVisible(first);
  makeVisible(last);

  trigger.focus();
  const trap = createFocusTrap(dialog);
  trap.activate();
  expect(targetDocument.activeElement).toBe(first);

  first.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true
  }));
  expect(targetDocument.activeElement).toBe(last);

  last.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true
  }));
  expect(targetDocument.activeElement).toBe(first);

  trap.deactivate();
  expect(targetDocument.activeElement).toBe(trigger);
});

it('excludes negative tabindex, inert content and disabled fieldsets', () => {
  const container = document.createElement('div');
  container.innerHTML = '<button tabindex="-1">Skip</button><div inert><button>Inert</button></div><fieldset disabled><input></fieldset><button>Reachable</button>';
  document.body.append(container);
  mounted.push(container);
  container.querySelectorAll<HTMLElement>('button, input').forEach(makeVisible);
  expect(getFocusableElements(container).map((element) => element.textContent)).toEqual(['Reachable']);
});

it('lets an external nested menu own focus and restores the enclosing dialog', () => {
  const dialog = document.createElement('div');
  const trigger = document.createElement('button');
  dialog.append(trigger);
  const menu = document.createElement('div');
  const item = document.createElement('button');
  menu.append(item);
  document.body.append(dialog, menu);
  mounted.push(dialog, menu);
  makeVisible(trigger);
  makeVisible(item);
  const outer = createFocusTrap(dialog);
  const inner = createFocusTrap(menu);
  outer.activate();
  inner.activate();
  expect(document.activeElement).toBe(item);
  item.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
  expect(document.activeElement).toBe(item);
  inner.deactivate();
  expect(document.activeElement).toBe(trigger);
  outer.deactivate();
});

it('preserves an input deliberately focused before activation', () => {
  const dialog = document.createElement('div');
  const close = document.createElement('button');
  const input = document.createElement('input');
  dialog.append(close, input);
  document.body.append(dialog);
  mounted.push(dialog);
  makeVisible(close);
  makeVisible(input);
  input.focus();
  const trap = createFocusTrap(dialog);
  trap.activate(undefined, close);
  expect(document.activeElement).toBe(input);
  trap.deactivate(false);
});

it('keeps focus in the parent dialog when a menu deletes its own opener', () => {
  const dialog = document.createElement('div');
  const close = document.createElement('button');
  const trigger = document.createElement('button');
  const menu = document.createElement('div');
  const item = document.createElement('button');
  dialog.append(close, trigger);
  menu.append(item);
  document.body.append(dialog, menu);
  mounted.push(dialog, menu);
  [close, trigger, item].forEach(makeVisible);
  const parent = createFocusTrap(dialog);
  const child = createFocusTrap(menu);
  parent.activate();
  trigger.focus();
  child.activate();
  trigger.remove();
  child.deactivate();
  expect(document.activeElement).toBe(close);
  parent.deactivate();
});

it('restores past a parent dialog closed by an action in its nested menu', () => {
  const opener = document.createElement('button');
  const dialog = document.createElement('div');
  const trigger = document.createElement('button');
  const menu = document.createElement('div');
  const item = document.createElement('button');
  dialog.append(trigger);
  menu.append(item);
  document.body.append(opener, dialog, menu);
  mounted.push(opener, dialog, menu);
  makeVisible(trigger);
  makeVisible(item);
  opener.focus();
  const parent = createFocusTrap(dialog);
  const child = createFocusTrap(menu);
  parent.activate();
  child.activate();
  parent.deactivate();
  child.deactivate();
  expect(document.activeElement).toBe(opener);
});
