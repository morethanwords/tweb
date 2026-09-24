export function getEnabledMenuItems(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item'))
  .filter((item) => item.closest('.btn-menu') === menu)
  .map((item) => item.querySelector<HTMLElement>('input[role="menuitemcheckbox"], input[role="menuitemradio"]') || item)
  .filter((item) => {
    if(!item.getAttribute('role')?.startsWith('menuitem') ||
      item.matches(':disabled, [aria-disabled="true"]') || item.closest('[hidden], [inert], [aria-hidden="true"], .hide')) return false;
    const style = item.ownerDocument.defaultView.getComputedStyle(item);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

/** The same activation path for popup menus and inline ButtonMenu consumers. */
export function handleMenuKeyDown(event: KeyboardEvent, menu = event.currentTarget as HTMLElement) {
  if(event.defaultPrevented || event.isComposing) return;
  const items = getEnabledMenuItems(menu);
  const current = event.target as HTMLElement;
  const index = items.indexOf(current);
  if(index === -1) {
    if(current === menu && items.length && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      items[event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0].focus();
    }
    return;
  }
  const activate = (item: HTMLElement) => item.closest<HTMLElement>('.btn-menu-item').click();

  if(event.key === 'Enter' || event.key === ' ') {
    if(current.getAttribute('aria-haspopup') === 'menu') return;
    event.preventDefault();
    if(!event.repeat) activate(current);
    return;
  }

  const radio = current as HTMLInputElement;
  if(radio.type === 'radio' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const group = items.filter((item) => (item as HTMLInputElement).type === 'radio' &&
      (item as HTMLInputElement).name === radio.name);
    const next = group[(group.indexOf(current) + (event.key === 'ArrowRight' ? 1 : group.length - 1)) % group.length];
    event.preventDefault();
    next.focus();
    activate(next);
    return;
  }

  let next: HTMLElement;
  switch(event.key) {
    case 'Home': next = items[0]; break;
    case 'End': next = items[items.length - 1]; break;
    case 'ArrowDown': next = items[(index + 1) % items.length]; break;
    case 'ArrowUp': next = items[(index + items.length - 1) % items.length]; break;
    default:
      if(event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      next = [...items.slice(index + 1), ...items.slice(0, index + 1)].find((item) =>
        (item.getAttribute('aria-label') || item.closest('.btn-menu-item').textContent).trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())
      );
  }
  if(next) {
    event.preventDefault();
    next.focus();
  }
}
