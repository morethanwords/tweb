import {createEffect, type JSX, onCleanup} from 'solid-js';
import Keyboard, {type VisualKeyboardRow} from './native/Keyboard';
import './TestKeyboard.scss';

export interface TestKeyboardProps {
  rows: VisualKeyboardRow[];
  identity: string;
  onButton: (id: string) => void;
  onInspect: (id: string, anchor: HTMLButtonElement) => void;
  disabledEditing?: boolean;
}

/** A short click window distinguishes simulation from editing without adding controls. */
export function TestKeyboard(props: TestKeyboardProps): JSX.Element {
  let host!: HTMLDivElement;
  let disposed = false;
  let pending: {id: string; identity: string; timer: ReturnType<typeof setTimeout>} | null = null;
  let secondPress: {id: string; identity: string} | null = null;
  let touch: {id: string; identity: string; pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout>} | null = null;
  let suppressClick = false;
  let suppressedPointer: number | null = null;
  let suppressionTimer: ReturnType<typeof setTimeout> | undefined;

  const findButton = (id: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-button-id]')].find(element => element.dataset.buttonId === id);
  const definition = (id: string) => props.rows.flatMap(row => row.buttons).find(button => button.id === id);
  function cancelPending(): void { if(pending) clearTimeout(pending.timer); pending = null; }
  function cancelTouch(): void {
    if(touch) clearTimeout(touch.timer);
    touch = null;
    window.removeEventListener('pointermove', touchMove);
    window.removeEventListener('pointerup', touchEnd);
    window.removeEventListener('pointercancel', touchCancel);
    document.removeEventListener('scroll', cancelTouchForScroll, true);
    window.removeEventListener('blur', cancelAll);
  }
  function cancelAll(): void { cancelPending(); cancelTouch(); secondPress = null; }
  function inspect(id: string, element: HTMLButtonElement): void {
    cancelAll();
    if(disposed || props.disabledEditing || !definition(id)) return;
    const anchor = findButton(id) ?? (element.isConnected ? element : undefined);
    if(anchor) props.onInspect(id, anchor);
  }
  function activate(id: string): void {
    if(disposed || props.disabledEditing) return;
    const button = definition(id);
    if(button && !button.disabled) props.onButton(id);
  }
  function click(id: string, element: HTMLButtonElement, event: MouseEvent): void {
    if(props.disabledEditing || suppressClick) return;
    if(event.detail === 0) { cancelAll(); activate(id); return; }
    if((secondPress?.id === id && secondPress.identity === props.identity) || (pending?.id === id && pending.identity === props.identity)) {
      inspect(id, element); return;
    }
    // The browser may retain a longer OS double-click interval. Once the first
    // action committed, its later native second click must not also open editing.
    if(event.detail >= 2) { cancelAll(); return; }
    secondPress = null; cancelPending();
    const identity = props.identity;
    const scheduled = {id, identity, timer: setTimeout(() => {
      if(pending !== scheduled) return;
      pending = null;
      if(props.identity === identity) activate(id);
    }, 500)};
    pending = scheduled;
  }
  function releaseSuppression(event: PointerEvent): void {
    if(event.pointerId !== suppressedPointer) return;
    clearTimeout(suppressionTimer);
    suppressionTimer = setTimeout(() => { suppressClick = false; suppressedPointer = null; }, 0);
    window.removeEventListener('pointerup', releaseSuppression);
  }
  function suppressRelease(pointerId: number): void {
    suppressClick = true; suppressedPointer = pointerId;
    window.addEventListener('pointerup', releaseSuppression);
  }
  function touchMove(event: PointerEvent): void {
    if(touch && event.pointerId === touch.pointerId && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) {
      suppressRelease(touch.pointerId); cancelTouch(); secondPress = null;
    }
  }
  function touchEnd(event: PointerEvent): void { if(event.pointerId === touch?.pointerId) cancelTouch(); }
  function touchCancel(event: PointerEvent): void {
    if(event.pointerId === touch?.pointerId) { suppressRelease(event.pointerId); cancelTouch(); secondPress = null; }
  }
  function cancelTouchForScroll(): void {
    if(touch) suppressRelease(touch.pointerId);
    cancelTouch(); secondPress = null;
  }
  function pointerDown(id: string, element: HTMLButtonElement, event: PointerEvent): void {
    if(!event.isPrimary || event.button !== 0 || props.disabledEditing) return;
    clearTimeout(suppressionTimer); suppressClick = false; suppressedPointer = null;
    window.removeEventListener('pointerup', releaseSuppression);
    secondPress = pending?.id === id && pending.identity === props.identity ? {id, identity: props.identity} : null;
    // A second press must not let the first click execute while it is being held.
    cancelPending(); cancelTouch();
    if(event.pointerType !== 'touch') return;
    const captured = props.identity;
    const held = {id, identity: captured, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      timer: setTimeout(() => {
        if(touch !== held || props.identity !== captured) return;
        const pointerId = held.pointerId;
        suppressRelease(pointerId); inspect(id, element);
      }, 500)};
    touch = held;
    window.addEventListener('pointermove', touchMove);
    window.addEventListener('pointerup', touchEnd);
    window.addEventListener('pointercancel', touchCancel);
    document.addEventListener('scroll', cancelTouchForScroll, true);
    window.addEventListener('blur', cancelAll);
  }
  function key(id: string, element: HTMLButtonElement, event: KeyboardEvent): void {
    if(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
      event.preventDefault(); event.stopPropagation(); inspect(id, element);
    } else if(event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); cancelAll(); suppressClick = false;
      if(!event.repeat) activate(id);
    } else if(event.key === 'Escape') cancelAll();
  }
  createEffect(() => {
    const identity = props.identity, disabled = props.disabledEditing;
    if(disabled || pending && pending.identity !== identity) cancelPending();
    if(disabled || touch && touch.identity !== identity) cancelTouch();
    if(disabled || secondPress && secondPress.identity !== identity) secondPress = null;
  });
  onCleanup(() => {
    disposed = true; cancelAll(); clearTimeout(suppressionTimer);
    window.removeEventListener('pointerup', releaseSuppression);
  });
  return <div class="test-keyboard" ref={element => { host = element; }} data-test-identity={props.identity}>
    <Keyboard rows={props.rows} onButton={id => activate(id)} testEditing={{
      onClick: click,
      onPointerDown: pointerDown,
      onKeyDown: key,
      onDoubleClick: (_id, _element, event) => {
        event.preventDefault(); event.stopPropagation();
        // The second click above already resolved the gesture. This native event
        // must never start a second operation after a committed single click.
        cancelAll();
      },
      onContextMenu: (id, element, event) => {
        event.preventDefault(); event.stopPropagation();
        if(touch) suppressRelease(touch.pointerId);
        inspect(id, element);
      }
    }} />
  </div>;
}
