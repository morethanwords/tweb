import {afterEach, expect, it} from 'vitest';
import attachTabList from '@helpers/dom/tabList';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
});

function createTabs(doc = document) {
  const menu = doc.createElement('div');
  const content = doc.createElement('div');
  const tabs = ['One', 'Two', 'Three'].map((name) => {
    const tab = doc.createElement('div');
    tab.className = 'menu-horizontal-div-item';
    tab.textContent = name;
    tab.addEventListener('click', () => {
      tabs.forEach((other) => other.classList.toggle('active', other === tab));
    });
    menu.append(tab);
    content.append(doc.createElement('div'));
    return tab;
  });
  tabs[0].classList.add('active');
  doc.body.append(menu, content);
  cleanups.push(attachTabList(menu, content));
  return {menu, content, tabs};
}

function press(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
}

it('links panels and keeps hidden content out of the focus order after selection', async() => {
  const {content, tabs} = createTabs();
  expect(content.children[0].getAttribute('aria-labelledby')).toBe(tabs[0].id);
  expect((content.children[1] as HTMLElement).inert).toBe(true);
  tabs[0].focus();
  press(tabs[0], 'ArrowRight');
  await Promise.resolve();
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  expect((content.children[0] as HTMLElement).inert).toBe(true);
  expect((content.children[1] as HTMLElement).inert).toBe(false);
});

it('does not double-activate when both a Solid strip and horizontalMenu register it', () => {
  const {menu, content, tabs} = createTabs();
  const detach = attachTabList(menu, content);
  cleanups.push(detach);
  let clicks = 0;
  menu.addEventListener('click', () => ++clicks);
  press(tabs[0], ' ');
  expect(clicks).toBe(1);
});

it('uses the owning document and RTL direction, skipping disabled and hidden tabs', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const {menu, tabs} = createTabs(frame.contentDocument);
  menu.style.direction = 'rtl';
  tabs[1].hidden = true;
  tabs[0].focus();
  press(tabs[0], 'ArrowLeft');
  expect(frame.contentDocument.activeElement).toBe(tabs[2]);
  press(tabs[2], 'Home');
  expect(frame.contentDocument.activeElement).toBe(tabs[0]);
});
