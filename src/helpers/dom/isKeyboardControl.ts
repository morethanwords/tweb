import isTargetAnInput from '@helpers/dom/isTargetAnInput';

/** Controls whose keys must not be redirected into a chat or story composer. */
export default function isKeyboardControl(element: HTMLElement) {
  // `[role="link"]` sits next to `a[href]` on purpose: an element that stands in
  // for a link has to be treated like one, or its keys get redirected into the
  // composer while a native link's do not.
  return !!element.closest('button, a[href], select, input[type="checkbox"], input[type="radio"], input[type="range"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="radio"], [role="slider"]');
}

export function shouldPreserveKeyboardFocus(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  return event.defaultPrevented || event.isComposing ||
    ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu'].includes(event.key) ||
    /^F\d+$/.test(event.key) || isKeyboardControl(target) ||
    (!event.altKey && !event.ctrlKey && !event.metaKey &&
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) &&
      !isTargetAnInput(target) && target.matches('.scrollable, [role="region"]') && target.tabIndex >= 0);
}
