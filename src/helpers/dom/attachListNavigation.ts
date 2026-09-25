import fastSmoothScroll from '@helpers/fastSmoothScroll';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import findUpClassName from '@helpers/dom/findUpClassName';
import isKeyboardControl from '@helpers/dom/isKeyboardControl';

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const HANDLE_EVENT = 'keydown';
const ACTIVE_CLASS_NAME = 'active';

const AXIS_Y_KEYS: ArrowKey[] = ['ArrowUp', 'ArrowDown'];
const AXIS_X_KEYS: ArrowKey[] = ['ArrowLeft', 'ArrowRight'];
export type ListNavigationOptions = {
  list: HTMLElement,
  type: 'xy' | 'x' | 'y',
  onSelect: (target: Element) => void | boolean | Promise<boolean>,
  once?: boolean,
  waitForKey?: string[],
  activeClassName?: string,
  cancelMouseDown?: boolean,
  target?: Element
  /** A real focusable picker grid, rather than autocomplete driven from an editor. */
  focusable?: boolean,
  itemSelector?: string
};

export default function attachListNavigation({
  list,
  type,
  onSelect,
  once,
  waitForKey,
  activeClassName = ACTIVE_CLASS_NAME,
  cancelMouseDown,
  target,
  focusable,
  itemSelector
}: ListNavigationOptions) {
  let waitForKeySet = waitForKey?.length ? new Set(waitForKey) : undefined;
  const keyNames = new Set(type === 'xy' ? AXIS_Y_KEYS.concat(AXIS_X_KEYS) : (type === 'x' ? AXIS_X_KEYS : AXIS_Y_KEYS));

  const getItems = () => Array.from(list.children).filter((item) => !itemSelector || item.matches(itemSelector));
  const getCurrentTarget = () => {
    const items = getItems();
    return target && items.includes(target) ? target : items.find((item) => item.classList.contains(activeClassName)) || items[0];
  };

  const setCurrentTarget = (_target: Element, scrollTo: boolean) => {
    if(target === _target) {
      return;
    }

    let hadTarget = false;
    if(target) {
      hadTarget = true;
      target.classList.remove(activeClassName);
      if(focusable) (target as HTMLElement).tabIndex = -1;
      if(target.getAttribute('role') === 'option') {
        target.setAttribute('aria-selected', 'false');
      }
    }

    target = _target;
    if(!target) return;
    target.classList.add(activeClassName);
    if(focusable) {
      (target as HTMLElement).tabIndex = 0;
      if(scrollTo) (target as HTMLElement).focus();
    }
    if(target.getAttribute('role') === 'option') {
      target.setAttribute('aria-selected', 'true');
    }

    if(hadTarget && scrollable && scrollTo) {
      fastSmoothScroll({
        container: scrollable,
        element: target as HTMLElement,
        position: 'center',
        forceDuration: 100,
        axis: type === 'x' ? 'x' : 'y'
      });
    }
  };

  const getNextTargetX = (currentTarget: Element, isNext: boolean): Element => {
    const items = getItems();
    return items[(items.indexOf(currentTarget) + (isNext ? 1 : items.length - 1)) % items.length];
  };

  const getNextTargetY = (currentTarget: Element, isNext: boolean) => {
    const currentRect = currentTarget.getBoundingClientRect();

    let nextTarget = getNextTargetX(currentTarget, isNext);
    while(nextTarget !== currentTarget) {
      const targetRect = nextTarget.getBoundingClientRect();
      if(targetRect.x === currentRect.x && targetRect.y !== currentRect.y) {
        break;
      }

      nextTarget = getNextTargetX(nextTarget, isNext);
    }

    return nextTarget;
  };

  let handleArrowKey: (currentTarget: Element, key: ArrowKey) => Element;
  if(type === 'xy') { // flex-direction: row; flex-wrap: wrap;
    handleArrowKey = (currentTarget, key) => {
      if(key === 'ArrowUp' || key === 'ArrowDown') return getNextTargetY(currentTarget, key === 'ArrowDown');
      else return getNextTargetX(currentTarget, key === 'ArrowRight');
    };
  } else { // flex-direction: row | column;
    handleArrowKey = (currentTarget, key) => getNextTargetX(currentTarget, key === 'ArrowRight' || key === 'ArrowDown');
  }

  let onKeyDown = (e: KeyboardEvent) => {
    if(e.defaultPrevented || e.isComposing || !getItems().length) return;
    if(!focusable && isKeyboardControl(e.target as HTMLElement)) return;
    if(focusable) {
      const focused = findUpAsChild(e.target as HTMLElement, list);
      if(!focused || !getItems().includes(focused)) return;
      target = focused;
      if(e.key === 'Home' || e.key === 'End') {
        cancelEvent(e);
        const items = getItems();
        setCurrentTarget(items[e.key === 'Home' ? 0 : items.length - 1], true);
        return;
      }
    }
    const key = e.key;
    if(!keyNames.has(key as any)) {
      if(key === 'Enter' || (focusable && key === ' ') || (!focusable && type !== 'xy' && key === 'Tab')) {
        cancelEvent(e);
        if(!e.repeat) fireSelect(getCurrentTarget());
      }

      return;
    }

    cancelEvent(e);

    if(list.childElementCount > 1) {
      let currentTarget = getCurrentTarget();
      currentTarget = handleArrowKey(currentTarget, key as any);
      setCurrentTarget(currentTarget, true);
    }
  };

  const scrollable = findUpClassName(list, 'scrollable');
  // Paints `.active` as the keyboard highlight — autocomplete only. A focusable grid highlights
  // with its own class and the focus ring, and its items may use `.active` for something else
  // (the selected theme tile).
  if(!focusable) list.classList.add('navigable-list');

  const onMouseMove = (e: MouseEvent) => {
    const target = findUpAsChild(e.target as HTMLElement, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
  };

  const onClick = (e: Event) => {
    cancelEvent(e); // cancel keyboard closening

    const target = findUpAsChild(e.target as HTMLElement, list) as HTMLElement;
    if(!target) {
      return;
    }

    setCurrentTarget(target, false);
    fireSelect(getCurrentTarget());
  };

  const fireSelect = async(target: Element) => {
    const canContinue = await onSelect(target);
    if(canContinue !== undefined ? !canContinue : once) {
      detach();
    }
  };

  let attached = false, attachedDocument: Document, detachClickEvent: () => void;
  const attach = () => {
    if(attached) return;
    attached = true;
    attachedDocument = list.ownerDocument;
    // const input = document.activeElement as HTMLElement;
    // input.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});
    (focusable ? list : attachedDocument).addEventListener(HANDLE_EVENT, onKeyDown as EventListener, {capture: true, passive: false});
    if(!focusable) list.addEventListener('mousemove', onMouseMove, {passive: true});
    if(cancelMouseDown) list.addEventListener('mousedown', cancelEvent);
    if(!focusable) detachClickEvent = attachClickEvent(list, onClick, {ignoreMove: cancelMouseDown});
  };

  const detach = () => {
    if(!attached) return;
    attached = false;
    // input.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
    (focusable ? list : attachedDocument).removeEventListener(HANDLE_EVENT, onKeyDown as EventListener, {capture: true});
    list.removeEventListener('mousemove', onMouseMove);
    if(cancelMouseDown) list.removeEventListener('mousedown', cancelEvent);
    detachClickEvent?.();
    detachClickEvent = undefined;
  };

  const resetTarget = () => {
    if(waitForKeySet) return;
    setCurrentTarget(getItems()[0], false);
  };

  if(waitForKeySet) {
    const _onKeyDown = onKeyDown;
    onKeyDown = (e) => {
      if(e.defaultPrevented || isKeyboardControl(e.target as HTMLElement)) return;
      if(waitForKeySet.has(e.key)) {
        cancelEvent(e);

        attachedDocument.removeEventListener(HANDLE_EVENT, onKeyDown, {capture: true});
        onKeyDown = _onKeyDown;
        attachedDocument.addEventListener(HANDLE_EVENT, onKeyDown, {capture: true, passive: false});

        waitForKeySet = undefined;
        resetTarget();
      }
    };
  } else if(!target) {
    resetTarget();
  }

  attach();

  return {
    attach,
    detach,
    resetTarget
  };
}

/**
 * Roving focus and activation for lazy emoji, sticker and GIF grids, and for single-choice rows
 * (`aria-pressed` items). Items that carry their own name (native buttons with text) can omit
 * `getLabel`.
 */
export function attachPickerGrid(list: HTMLElement, itemSelector: string, getLabel?: (item: HTMLElement, index: number) => string) {
  const sync = (records?: MutationRecord[]) => {
    const controls = (Array.from(list.children) as HTMLElement[]).filter((item) => item.matches(itemSelector));
    // The one tab stop stays on the focused item while focus is inside; otherwise Tab enters a
    // single-choice grid on its chosen item — following the choice when it moves without the
    // keyboard (a click, a change made elsewhere) — and any other grid on its first item.
    const focused = controls.find((item) => item.contains(list.ownerDocument.activeElement));
    const pressed = controls.find((item) => item.getAttribute('aria-pressed') === 'true');
    const choiceMoved = records?.some((record) => record.type === 'attributes');
    // By the attribute: a native button reports `tabIndex` 0 before anything has set it.
    const current = focused ||
      (choiceMoved && pressed) ||
      controls.find((item) => item.getAttribute('tabindex') === '0') ||
      pressed ||
      controls[0];
    controls.forEach((item, index) => {
      if(item.tagName !== 'BUTTON') item.setAttribute('role', 'button');
      item.tabIndex = item === current ? 0 : -1;
      if(getLabel) item.setAttribute('aria-label', getLabel(item, index));
    });
    return current;
  };
  const observer = new MutationObserver(sync);
  observer.observe(list, {childList: true});
  // Separate, as `subtree` here would also report every node a lazy grid item loads into itself.
  const choiceObserver = new MutationObserver(sync);
  choiceObserver.observe(list, {subtree: true, attributeFilter: ['aria-pressed']});
  // Handed over as the starting target, or the navigation would put a second tab stop on the
  // first item of a grid that already has its items.
  const initialTarget = sync();
  const navigation = attachListNavigation({
    list,
    type: 'xy',
    focusable: true,
    itemSelector,
    activeClassName: 'keyboard-focused',
    target: initialTarget,
    onSelect: (target) => { (target as HTMLElement).click(); }
  });
  return () => {
    observer.disconnect();
    choiceObserver.disconnect();
    navigation.detach();
  };
}
