/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {onAppWindowChange} from '@helpers/appWindow';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'audio[controls]',
  'video[controls]',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])'
].join(',');

// Visible, enabled, focusable descendants of `container`, in DOM order.
export function getFocusableElements(container: HTMLElement) {
  return (Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[])
  .filter((element) => {
    if(element.matches(':disabled') ||
      element.hasAttribute('tabindex') && element.tabIndex < 0 ||
      element.closest('[inert], [hidden], [aria-hidden="true"]')) {
      return false;
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if(style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.display === 'none') {
      return false;
    }

    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  })
  .filter((element, _, elements) => {
    if(!element.matches('input[type="radio"][name]')) return true;
    const radio = element as HTMLInputElement;
    const group = elements.filter((other): other is HTMLInputElement =>
      other.matches('input[type="radio"]') &&
      (other as HTMLInputElement).name === radio.name &&
      (other as HTMLInputElement).form === radio.form
    );
    return radio === (group.find((other) => other.checked) || group[0]);
  })
  .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}

export type FocusTrap = ReturnType<typeof createFocusTrap>;
type FocusScope = {element: HTMLElement, restoreTo?: HTMLElement};
const documentTraps = new WeakMap<Document, FocusScope[]>();

/**
 * Keeps keyboard focus inside `element` while active — Tab / Shift+Tab wrap
 * around its focusable children. `isActive` lets callers (e.g. stacked popups)
 * keep only the topmost trap live. `deactivate` restores the prior focus.
 */
export default function createFocusTrap(element: HTMLElement, isActive: () => boolean = () => true) {
  let activeDocument: Document;
  let stopFollowingWindow: () => void;
  const token: FocusScope = {element};
  const isTopmost = () => {
    const stack = documentTraps.get(activeDocument);
    return isActive() && stack?.[stack.length - 1] === token;
  };

  const focusInside = () => {
    if(!element.hasAttribute('tabindex')) element.tabIndex = -1;
    (getFocusableElements(element)[0] || element).focus();
  };

  const onFocusIn = (event: FocusEvent) => {
    if(isTopmost() && !element.contains(event.target as Node)) focusInside();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Tab' || e.defaultPrevented || !isTopmost()) {
      return;
    }

    const focusable = getFocusableElements(element);
    if(!focusable.length) {
      e.preventDefault();
      focusInside();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = activeDocument.activeElement as HTMLElement;

    if(e.shiftKey) {
      if(active === first || !element.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if(active === last || !element.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  const bindDocument = (doc: Document) => {
    if(activeDocument === doc) return;
    const focused = activeDocument?.activeElement as HTMLElement;
    const oldStack = documentTraps.get(activeDocument);
    const index = oldStack?.indexOf(token) ?? -1;
    if(index !== -1) oldStack.splice(index, 1);
    activeDocument?.removeEventListener('keydown', onKeyDown, true);
    activeDocument?.removeEventListener('focusin', onFocusIn);
    activeDocument = doc;
    const stack = documentTraps.get(doc) || [];
    stack.push(token);
    documentTraps.set(doc, stack);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('focusin', onFocusIn);
    // setAppWindow runs before the synchronous DOM adoption. Restore after the
    // move, keeping the same control when the entire open dialog changes realm.
    if(focused) queueMicrotask(() => {
      if(activeDocument !== doc || !isTopmost() || element.ownerDocument !== doc) return;
      if(element.contains(focused)) focused.focus();
      else if(!element.contains(doc.activeElement)) focusInside();
    });
  };

  const trap = {
    activate(restoreTo?: HTMLElement, initialFocus?: HTMLElement) {
      if(activeDocument) trap.deactivate(false);
      const doc = element.ownerDocument || document;
      token.restoreTo = restoreTo || doc.activeElement as HTMLElement;
      bindDocument(doc);
      stopFollowingWindow = onAppWindowChange((win, prev) => {
        if(activeDocument === prev.document) bindDocument(win.document);
      });
      if(!element.hasAttribute('tabindex')) element.tabIndex = -1;

      if(!element.contains(activeDocument.activeElement)) {
        if(initialFocus) initialFocus.focus();
        else focusInside();
      }
    },
    deactivate(restoreFocus = true) {
      stopFollowingWindow?.();
      stopFollowingWindow = undefined;
      const stack = documentTraps.get(activeDocument);
      const wasTopmost = stack?.[stack.length - 1] === token;
      const index = stack?.indexOf(token) ?? -1;
      if(index !== -1 && restoreFocus) {
        // A menu action can close its parent dialog before closing the menu.
        // Forward restoration past that disappearing dialog instead of focusing
        // a button in its closing animation.
        stack.slice(index + 1).forEach((scope) => {
          if(element.contains(scope.restoreTo)) scope.restoreTo = token.restoreTo;
        });
      }
      if(index !== -1) stack.splice(index, 1);
      activeDocument?.removeEventListener('keydown', onKeyDown, true);
      activeDocument?.removeEventListener('focusin', onFocusIn);
      if(restoreFocus && wasTopmost && token.restoreTo?.isConnected && token.restoreTo.focus) {
        token.restoreTo.focus();
      }
      const parent = stack?.[stack.length - 1]?.element;
      if(restoreFocus && wasTopmost && parent) {
        const doc = activeDocument;
        const restoreParentFocus = () => {
          const scopes = documentTraps.get(doc);
          if(scopes?.[scopes.length - 1]?.element === parent && !parent.contains(doc.activeElement)) {
            (getFocusableElements(parent)[0] || parent).focus();
          }
        };
        restoreParentFocus();
        // Component cleanup can close the menu just before removing its opener.
        queueMicrotask(restoreParentFocus);
      }

      token.restoreTo = undefined;
      activeDocument = undefined;
    }
  };
  return trap;
}
