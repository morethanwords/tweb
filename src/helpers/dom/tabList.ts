function getTabs(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="tab"]'))
  .filter((tab) => tab.closest('[role="tablist"]') === menu);
}

export function handleTabKeyDown(event: KeyboardEvent) {
  if(event.defaultPrevented || event.isComposing) return;
  const current = event.target as HTMLElement;
  const menu = event.currentTarget as HTMLElement;
  if(current.getAttribute('role') !== 'tab' || current.closest('[role="tablist"]') !== menu) return;

  const tabs = getTabs(menu).filter((tab) => !tab.matches(':disabled, [aria-disabled="true"]') &&
    !tab.closest('[hidden], [inert], .hide') && tab.ownerDocument.defaultView.getComputedStyle(tab).display !== 'none');
  const index = tabs.indexOf(current);
  if(index === -1) return;

  const vertical = menu.getAttribute('aria-orientation') === 'vertical';
  const rtl = menu.ownerDocument.defaultView.getComputedStyle(menu).direction === 'rtl';
  const previous = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
  const next = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
  let nextIndex: number;
  switch(event.key) {
    case 'Home': nextIndex = 0; break;
    case 'End': nextIndex = tabs.length - 1; break;
    case previous: nextIndex = (index - 1 + tabs.length) % tabs.length; break;
    case next: nextIndex = (index + 1) % tabs.length; break;
    case 'Enter':
    case ' ':
      if(!current.matches('button, a[href]') && !event.repeat) {
        event.preventDefault();
        current.click();
      }
      return;
    default: return;
  }

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

let nextTabId = 0;
const tabLists = new WeakMap<HTMLElement, {references: number, content?: HTMLElement, sync: () => void, destroy: () => void}>();

/** Shared by Solid tab strips and legacy horizontalMenu. One listener and observer per strip. */
export default function attachTabList(menu: HTMLElement, content?: HTMLElement) {
  let state = tabLists.get(menu);
  if(!state) {
    state = {
      references: 0,
      content,
      sync: () => {
        (Array.from(menu.children) as HTMLElement[]).forEach((child, index) => {
          const panel = state.content?.children[+(child.dataset.tab ?? index)] as HTMLElement;
          if((!panel && !child.matches('.menu-horizontal-div-item, [role="tab"]')) || child.dataset.tab === '-1') return;
          child.setAttribute('role', 'tab');
          if(panel) {
            child.id ||= `tab-${++nextTabId}`;
            panel.id ||= `tabpanel-${++nextTabId}`;
            child.setAttribute('aria-controls', panel.id);
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', child.id);
          }
        });
        const tabs = getTabs(menu);
        const selected = tabs.find((tab) => tab.classList.contains('active')) || tabs[0];
        tabs.forEach((tab) => {
          const active = tab === selected;
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
          const panelId = tab.getAttribute('aria-controls');
          const panel = panelId && state.content?.children.namedItem(panelId) as HTMLElement;
          if(panel) {
            panel.inert = !active;
            panel.setAttribute('aria-hidden', String(!active));
          }
        });
      },
      destroy: () => {
        observer.disconnect();
        menu.removeEventListener('keydown', handleTabKeyDown);
        tabLists.delete(menu);
      }
    };
    const observer = new MutationObserver(state.sync);
    observer.observe(menu, {attributes: true, attributeFilter: ['class'], childList: true, subtree: true});
    menu.setAttribute('role', 'tablist');
    menu.addEventListener('keydown', handleTabKeyDown);
    tabLists.set(menu, state);
  }
  if(content) state.content = content;
  ++state.references;
  state.sync();
  return () => {
    if(!--state.references) state.destroy();
  };
}
