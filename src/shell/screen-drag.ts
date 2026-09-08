import {createSignal, onCleanup, onMount} from 'solid-js';
import type {ShellDocument} from './core/types';

type Gesture = {
  stepId: string; pointerId: number; x: number; y: number; currentX: number; currentY: number;
  revision: number; documentId: string; order: string[]; active: boolean; external: boolean;
  acquired: boolean;
  targetIndex: number | null; ghost: HTMLElement | null; touch: boolean; holdTimer?: ReturnType<typeof setTimeout>;
};

export type ScreenDragOptions = {
  document: () => ShellDocument;
  revision: () => number;
  order: () => readonly string[];
  container: () => HTMLElement | undefined;
  disabled: () => boolean;
  onInteractionStart: () => boolean | void;
  onDragStart: () => boolean | void;
  onMove: (stepId: string, index: number, baseRevision: number) => void;
  onExternalHover: (stepId: string, x: number, y: number) => boolean;
  onExternalDrop: (stepId: string, x: number, y: number, baseRevision: number) => 'changed' | 'noop' | false;
  onExternalCancel: () => void;
};

/** Pointer gesture owner for sidebar ordering and screen-to-button links. */
export function createScreenDrag(options: ScreenDragOptions) {
  let gesture: Gesture | null = null;
  let suppressClick = false;
  let suppressedPointerId: number | null = null;
  let suppressionTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollFrame: number | undefined;
  let disposed = false;
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [markerTop, setMarkerTop] = createSignal<number | null>(null);
  const [announcement, setAnnouncement] = createSignal('');
  const elements = () => [...(options.container()?.querySelectorAll<HTMLElement>('[data-screen-sortable="true"]') ?? [])];
  const valid = (held: Gesture) => {
    const order = options.order();
    return !disposed && !options.disabled() && held.revision === options.revision() && held.documentId === options.document().id &&
      held.order.length === order.length && held.order.every((id, index) => order[index] === id);
  };
  function stopAutoScroll(): void {if(scrollFrame !== undefined) cancelAnimationFrame(scrollFrame); scrollFrame = undefined;}
  function releaseClickGuard(delay = 0): void {
    clearTimeout(suppressionTimer);
    suppressionTimer = setTimeout(() => {suppressClick = false; suppressedPointerId = null;}, delay);
  }
  function destinationAt(x: number, y: number): {index: number; top: number} | null {
    const held = gesture, container = options.container(), items = elements();
    if(!held || !container || !items.length) return null;
    const bounds = container.getBoundingClientRect(), first = items[0].getBoundingClientRect(), last = items.at(-1)!.getBoundingClientRect();
    if(x < bounds.left || x > bounds.right || y < first.top - 10 || y > last.bottom + 10) return null;
    let insertion = items.findIndex(item => {const box = item.getBoundingClientRect(); return y < box.top + box.height / 2;});
    if(insertion === -1) insertion = items.length;
    const source = held.order.indexOf(held.stepId);
    const index = Math.min(items.length - 1, insertion > source ? insertion - 1 : insertion);
    if(index === source) return null;
    const marker = insertion === items.length ? last.bottom : items[insertion].getBoundingClientRect().top;
    return {index, top: marker - bounds.top + container.scrollTop};
  }
  function updateTarget(x: number, y: number): void {
    const held = gesture;
    if(!held) return;
    held.currentX = x; held.currentY = y;
    held.external = options.onExternalHover(held.stepId, x, y);
    const destination = held.external ? null : destinationAt(x, y);
    held.targetIndex = destination?.index ?? null; setMarkerTop(destination?.top ?? null);
  }
  function autoScroll(): void {
    stopAutoScroll();
    const tick = () => {
      scrollFrame = undefined;
      const held = gesture, container = options.container();
      if(!held?.active || held.external || !container) return;
      const box = container.getBoundingClientRect();
      const delta = held.currentY < box.top + 34 ? -10 : held.currentY > box.bottom - 34 ? 10 : 0;
      if(!delta) return;
      const before = container.scrollTop; container.scrollTop += delta;
      if(container.scrollTop !== before) updateTarget(held.currentX, held.currentY);
      scrollFrame = requestAnimationFrame(tick);
    };
    scrollFrame = requestAnimationFrame(tick);
  }
  function clearGesture(commit: boolean): void {
    const held = gesture;
    if(!held) return;
    gesture = null; clearTimeout(held.holdTimer); stopAutoScroll(); held.ghost?.remove();
    const container = options.container();
    if(container?.hasPointerCapture?.(held.pointerId)) container.releasePointerCapture(held.pointerId);
    setDragging(null); setMarkerTop(null);
    const linked = commit && held.active && held.external && valid(held) ? options.onExternalDrop(held.stepId, held.currentX, held.currentY, held.revision) : false;
    if(held.acquired) options.onExternalCancel();
    if(linked === 'changed') setAnnouncement('Экран назначен кнопке');
    else if(linked === 'noop') setAnnouncement('Кнопка уже ведёт на этот экран');
    else if(commit && held.active && held.targetIndex !== null && valid(held)) {
      options.onMove(held.stepId, held.targetIndex, held.revision); setAnnouncement('Порядок экранов изменён');
    } else if(held.active) setAnnouncement('Перемещение отменено');
    queueMicrotask(() => options.container()?.querySelector<HTMLElement>(`[data-screen-id="${held.stepId}"] .screen-chat`)?.focus({preventScroll: true}));
  }
  function activate(held: Gesture): void {
    if(gesture !== held || !valid(held)) {clearGesture(false); return;}
    held.acquired = options.onDragStart() !== false;
    if(!held.acquired) {clearGesture(false); return;}
    const container = options.container();
    const source = elements().find(item => item.dataset.screenId === held.stepId);
    if(!container || !source) {clearGesture(false); return;}
    held.active = true; suppressClick = true; suppressedPointerId = held.pointerId;
    const clone = source.cloneNode(true) as HTMLElement, box = source.getBoundingClientRect();
    clone.classList.add('screen-drag-ghost'); clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('button, input').forEach(element => element.setAttribute('tabindex', '-1'));
    Object.assign(clone.style, {left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`});
    document.body.append(clone); held.ghost = clone; container.setPointerCapture(held.pointerId); setDragging(held.stepId);
    setAnnouncement('Перетащите экран в списке или на кнопку');
  }
  function begin(stepId: string, event: PointerEvent): void {
    if(options.disabled() || event.button !== 0 || !event.isPrimary || gesture) return;
    clearTimeout(suppressionTimer); suppressClick = false; suppressedPointerId = null;
    if(options.onInteractionStart() === false) return;
    gesture = {stepId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY,
      revision: options.revision(), documentId: options.document().id, order: [...options.order()], active: false, external: false,
      targetIndex: null, ghost: null, touch: event.pointerType === 'touch', acquired: false};
    if(gesture.touch) {const held = gesture; held.holdTimer = setTimeout(() => activate(held), 300);}
  }
  function move(event: PointerEvent): void {
    const held = gesture;
    if(!held || held.pointerId !== event.pointerId) return;
    if(!valid(held)) {clearGesture(false); return;}
    if(!held.active) {
      const distance = Math.hypot(event.clientX - held.x, event.clientY - held.y);
      if(held.touch) {if(distance > 8) clearGesture(false); return;}
      if(distance < 5) return;
      activate(held); if(!held.active) return;
    }
    event.preventDefault();
    held.ghost!.style.transform = `translate(${event.clientX - held.x}px, ${event.clientY - held.y}px)`;
    updateTarget(event.clientX, event.clientY); autoScroll();
  }
  const up = (event: PointerEvent) => {
    if(gesture?.pointerId === event.pointerId) clearGesture(true);
    if(suppressedPointerId === event.pointerId) releaseClickGuard();
  };
  const cancelPointer = (event: PointerEvent) => {if(gesture?.pointerId === event.pointerId) {clearGesture(false); if(suppressedPointerId === event.pointerId) releaseClickGuard(500);}};
  const cancel = () => {const pointerId = gesture?.pointerId; clearGesture(false); if(pointerId !== undefined && suppressedPointerId === pointerId) releaseClickGuard(500);};
  const escape = (event: KeyboardEvent) => {if(event.key === 'Escape' && gesture) {event.preventDefault(); event.stopPropagation(); clearGesture(false);}};
  const layoutChange = () => {if(gesture?.active) updateTarget(gesture.currentX, gesture.currentY); else if(gesture) clearGesture(false);};
  const touchMove = (event: TouchEvent) => {if(gesture?.touch && gesture.active && event.cancelable) event.preventDefault();};
  window.addEventListener('pointermove', move, {passive: false}); window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelPointer); window.addEventListener('blur', cancel); window.addEventListener('keydown', escape, true);
  window.addEventListener('scroll', layoutChange, true); window.addEventListener('resize', layoutChange);
  onMount(() => options.container()?.addEventListener('touchmove', touchMove, {passive: false}));
  onCleanup(() => {
    disposed = true; clearGesture(false); clearTimeout(suppressionTimer); stopAutoScroll();
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', layoutChange, true); window.removeEventListener('resize', layoutChange); options.container()?.removeEventListener('touchmove', touchMove);
  });
  return {dragging, markerTop, announcement, begin, allowClick: () => !suppressClick};
}
