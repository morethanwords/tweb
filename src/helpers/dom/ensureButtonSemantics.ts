import Modes from '@config/modes';

/** Shared semantics for legacy/custom-element triggers using attachClickEvent. */
export default function ensureButtonSemantics(element: HTMLElement) {
  if(!Modes.a11y) { // the role only: no tab stop, and a button keeps its default type
    if(!element.matches('button, input, select, textarea, a[href], [role]')) element.setAttribute('role', 'button');
    return;
  }

  if(element.matches('button, input, select, textarea, a[href]')) {
    if(element.tagName === 'BUTTON' && !element.hasAttribute('type')) (element as HTMLButtonElement).type = 'button';
    return;
  }
  if(!element.hasAttribute('role')) element.setAttribute('role', 'button');
  if(!element.hasAttribute('tabindex')) element.tabIndex = 0;
}
