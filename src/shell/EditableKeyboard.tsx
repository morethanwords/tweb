import {createEffect, createMemo, createSignal, For, type JSX, onCleanup, onMount, Show} from 'solid-js';
import type {KeyboardRow, ShellDocument} from './core/types';
import Keyboard from './native/Keyboard';
import {moveKeyboardButton, type KeyboardDestination} from './keyboard-layout';
import './EditableKeyboard.scss';

export interface EditableKeyboardProps {
  document: ShellDocument;
  stepId: string;
  messageId: string;
  revision: number;
  onInspect: (buttonId: string, element: HTMLButtonElement) => void;
  onNavigate: (stepId: string) => void;
  onAdd: () => void;
  onMove: (rows: KeyboardRow[], baseRevision: number) => void;
  onDragStart?: () => boolean | void;
  onExternalHover?: (buttonId: string, x: number, y: number) => boolean;
  onExternalDrop?: (buttonId: string, x: number, y: number, baseRevision: number) => 'changed' | 'noop' | false;
  onExternalCancel?: () => void;
  linkTargetButtonId?: string | null;
  newRowId: () => string;
  onInteractionStart: () => boolean | void;
}

type Gesture = {
  buttonId: string; pointerId: number; x: number; y: number; currentX: number; currentY: number;
  revision: number; documentId: string; stepId: string; messageId: string; rows: KeyboardRow[];
  rowId: string; active: boolean; target: KeyboardDestination | null;
  acquired: boolean;
  ghost: HTMLElement | null; left: number; top: number; width: number; height: number;
  touch: boolean; external: boolean; holdTimer?: ReturnType<typeof setTimeout>;
};
type Marker = {left: number; top: number; height: number};

/** One gesture produces one layout command; no intermediate layout reaches the document. */
export function EditableKeyboard(props: EditableKeyboardProps): JSX.Element {
  let host!: HTMLDivElement;
  let gesture: Gesture | null = null;
  let suppressClick = false;
  let suppressedPointerId: number | null = null;
  let suppressionTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [target, setTarget] = createSignal<KeyboardDestination | null>(null);
  const [gaps, setGaps] = createSignal<{index: number; top: number}[]>([]);
  const [marker, setMarker] = createSignal<Marker | null>(null);
  const [announcement, setAnnouncement] = createSignal('');
  const visualRows = createMemo(() => props.document.messages[props.messageId].rows.map(row => ({
    id: row.id, buttons: row.buttonIds.map(id => ({id, label: props.document.content.buttons[id], color: props.document.buttons[id].color}))
  })));
  const findButton = (id: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-button-id]')].find(element => element.dataset.buttonId === id);
  const validIdentity = (held: Gesture) => !disposed && held.revision === props.revision &&
    held.documentId === props.document.id && held.stepId === props.stepId && held.messageId === props.messageId;
  const releaseClickGuard = (delay = 0) => {
    clearTimeout(suppressionTimer);
    suppressionTimer = setTimeout(() => { suppressClick = false; suppressedPointerId = null; }, delay);
  };

  function measureGaps(): void {
    if(!gesture?.active || !host.isConnected) return;
    const box = host.getBoundingClientRect();
    const rows = [...host.querySelectorAll<HTMLElement>('.reply-markup-row')];
    setGaps(rows.map((row, index) => ({index, top: row.getBoundingClientRect().top - box.top - 6}))
      .concat(rows.length ? [{index: rows.length, top: rows.at(-1)!.getBoundingClientRect().bottom - box.top - 6}] : []));
  }

  function clearGesture(commit: boolean): void {
    const held = gesture;
    if(!held) return;
    gesture = null;
    clearTimeout(held.holdTimer);
    held.ghost?.remove();
    if(host.hasPointerCapture?.(held.pointerId)) host.releasePointerCapture(held.pointerId);
    setDragging(null); setTarget(null); setMarker(null); setGaps([]);
    const linked = commit && held.active && held.external && validIdentity(held) ?
      props.onExternalDrop?.(held.buttonId, held.currentX, held.currentY, held.revision) ?? false : false;
    if(held.acquired) props.onExternalCancel?.();
    if(linked === 'changed') {
      setAnnouncement('Переход кнопки изменён');
      queueMicrotask(() => { if(!disposed) findButton(held.buttonId)?.focus({preventScroll: true}); });
    } else if(linked === 'noop') {
      setAnnouncement('Кнопка уже ведёт на этот экран');
      queueMicrotask(() => { if(!disposed) findButton(held.buttonId)?.focus({preventScroll: true}); });
    } else if(commit && held.active && held.target && validIdentity(held)) {
      const next = moveKeyboardButton(held.rows, held.buttonId, held.target, held.rowId);
      if(next !== held.rows) {
        props.onMove(next, held.revision);
        setAnnouncement('Кнопка перемещена');
        queueMicrotask(() => { if(!disposed) findButton(held.buttonId)?.focus({preventScroll: true}); });
      }
    } else if(held.active) setAnnouncement('Перемещение отменено');
  }

  function destinationAt(x: number, y: number): KeyboardDestination | null {
    const held = gesture;
    if(!held) return null;
    const hostBox = host.getBoundingClientRect();
    if(x < hostBox.left || x > hostBox.right) return null;
    for(const gap of gaps()) {
      const top = hostBox.top + gap.top;
      if(y >= top && y <= top + 12) return {kind: 'new-row', index: gap.index};
    }
    for(const row of host.querySelectorAll<HTMLElement>('.reply-markup-row')) {
      const box = row.getBoundingClientRect();
      if(y < box.top || y > box.bottom) continue;
      const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-button-id]')];
      let column = buttons.findIndex(button => {
        const bounds = button.getBoundingClientRect();
        return x < bounds.left + bounds.width / 2;
      });
      if(column === -1) column = buttons.length;
      return {kind: 'row', rowId: row.dataset.rowId!, column};
    }
    return null;
  }

  function updateTarget(x: number, y: number): void {
    const held = gesture;
    if(!held) return;
    held.currentX = x; held.currentY = y;
    const external = !!props.onExternalHover?.(held.buttonId, x, y);
    held.external = external;
    const destination = external ? null : destinationAt(x, y);
    // Rejected/full targets and self-drops never promise a move.
    held.target = destination && moveKeyboardButton(held.rows, held.buttonId, destination, held.rowId) !== held.rows ? destination : null;
    setTarget(held.target);
    setMarker(null);
    if(held.target?.kind === 'row') {
      const destination = held.target;
      const row = [...host.querySelectorAll<HTMLElement>('.reply-markup-row')].find(element => element.dataset.rowId === destination.rowId);
      if(!row) return;
      const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-button-id]')];
      const button = buttons[destination.column];
      const rowBox = row.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      setMarker({left: (button ? button.getBoundingClientRect().left : rowBox.right) - hostBox.left,
        top: rowBox.top - hostBox.top + 4, height: rowBox.height - 8});
    }
  }

  function activateDrag(held: Gesture): void {
    if(gesture !== held) return;
    if(!validIdentity(held)) { clearGesture(false); return; }
    held.acquired = props.onDragStart?.() !== false;
    if(!held.acquired) { clearGesture(false); return; }
    const source = findButton(held.buttonId);
    if(!source) { clearGesture(false); return; }
    held.active = true; suppressClick = true; suppressedPointerId = held.pointerId;
    const clone = source.cloneNode(true) as HTMLElement;
    const style = getComputedStyle(source);
    clone.removeAttribute('data-button-id');
    clone.removeAttribute('aria-description');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('tabindex', '-1');
    clone.querySelectorAll('.shell-ripple-circle').forEach(node => node.remove());
    clone.classList.add('keyboard-drag-ghost');
    Object.assign(clone.style, {left: `${held.left}px`, top: `${held.top}px`, width: `${held.width}px`,
      height: `${held.height}px`, backgroundColor: style.backgroundColor, color: style.color,
      font: style.font, borderRadius: style.borderRadius});
    document.body.append(clone); held.ghost = clone;
    host.setPointerCapture(held.pointerId);
    setDragging(held.buttonId); measureGaps();
    setAnnouncement('Перетащите в ряд или на линию между рядами. Escape отменяет перемещение.');
  }
  function move(event: PointerEvent): void {
    const held = gesture;
    if(!held || held.pointerId !== event.pointerId) return;
    if(!validIdentity(held)) { clearGesture(false); return; }
    if(!held.active) {
      const distance = Math.hypot(event.clientX - held.x, event.clientY - held.y);
      // A normal swipe keeps browser scrolling; only a stationary hold arms touch drag.
      if(held.touch) { if(distance > 8) clearGesture(false); return; }
      if(distance < 5) return;
      activateDrag(held);
      if(!held.active) return;
    }
    event.preventDefault();
    held.ghost!.style.transform = `translate(${event.clientX - held.x}px, ${event.clientY - held.y}px)`;
    updateTarget(event.clientX, event.clientY);
  }

  function begin(buttonId: string, element: HTMLButtonElement, event: PointerEvent): void {
    if(event.button !== 0 || !event.isPrimary || gesture) return;
    // A new deliberate gesture is never consumed by a previously cancelled drag.
    clearTimeout(suppressionTimer); suppressClick = false; suppressedPointerId = null;
    event.stopPropagation();
    if(props.onInteractionStart() === false) return;
    const source = findButton(buttonId) ?? element;
    const box = source.getBoundingClientRect();
    gesture = {buttonId, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      currentX: event.clientX, currentY: event.clientY,
      revision: props.revision, documentId: props.document.id, stepId: props.stepId, messageId: props.messageId,
      rows: props.document.messages[props.messageId].rows, rowId: props.newRowId(), active: false, target: null,
      touch: event.pointerType === 'touch', external: false, acquired: false,
      ghost: null, left: box.left, top: box.top, width: box.width, height: box.height};
    if(gesture.touch) {
      const held = gesture;
      held.holdTimer = setTimeout(() => activateDrag(held), 300);
    }
  }

  function keyMove(buttonId: string, event: KeyboardEvent): void {
    if(!gesture && (event.key === 'Enter' || event.key === ' ')) { suppressClick = false; suppressedPointerId = null; }
    if(!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    clearGesture(false);
    if(props.onInteractionStart() === false) return;
    const rows = props.document.messages[props.messageId].rows;
    const index = rows.findIndex(row => row.buttonIds.includes(buttonId));
    if(index === -1) return;
    const row = rows[index];
    const column = row.buttonIds.indexOf(buttonId);
    let destination: KeyboardDestination;
    if(event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      destination = {kind: 'row', rowId: row.id, column: event.key === 'ArrowLeft' ? Math.max(0, column - 1) : Math.min(row.buttonIds.length, column + 2)};
    } else if(event.shiftKey) destination = {kind: 'new-row', index: index + (event.key === 'ArrowDown' ? 1 : 0)};
    else {
      const nextRow = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if(!nextRow) return;
      destination = {kind: 'row', rowId: nextRow.id, column: nextRow.buttonIds.length};
    }
    const revision = props.revision;
    const next = moveKeyboardButton(rows, buttonId, destination, props.newRowId());
    if(next !== rows) {
      props.onMove(next, revision);
      setAnnouncement('Кнопка перемещена');
      queueMicrotask(() => { if(!disposed) findButton(buttonId)?.focus({preventScroll: true}); });
    }
  }

  function openTarget(buttonId: string, element: HTMLButtonElement, event: MouseEvent): void {
    event.preventDefault(); event.stopPropagation();
    clearGesture(false);
    if(props.onInteractionStart() === false) return;
    const targetStepId = props.document.buttons[buttonId]?.targetStepId;
    if(targetStepId && props.document.steps[targetStepId]) props.onNavigate(targetStepId);
    else props.onInspect(buttonId, element);
  }

  const up = (event: PointerEvent) => {
    if(gesture?.pointerId === event.pointerId) clearGesture(true);
    // Keep suppression through pointerup even if Escape cancelled earlier while held.
    if(suppressedPointerId === event.pointerId) releaseClickGuard();
  };
  const cancelPointer = (event: PointerEvent) => {
    if(gesture?.pointerId === event.pointerId) {clearGesture(false); if(suppressedPointerId === event.pointerId) releaseClickGuard(500);}
    // A delayed release may still arrive after cancellation. Keep its click guarded;
    // pointerup, or the next deliberate pointerdown/keyboard activation, releases it.
  };
  const cancel = () => {const pointerId = gesture?.pointerId; clearGesture(false); if(pointerId !== undefined && suppressedPointerId === pointerId) releaseClickGuard(500);};
  const escape = (event: KeyboardEvent) => {
    if(event.key === 'Escape' && gesture) { event.preventDefault(); event.stopPropagation(); clearGesture(false); }
  };
  const scroll = () => {
    if(gesture && !gesture.active) { clearGesture(false); return; }
    if(gesture?.active) { measureGaps(); updateTarget(gesture.currentX, gesture.currentY); }
  };
  const touchMove = (event: TouchEvent) => {
    if(!gesture?.touch) return;
    if(event.touches.length > 1) { clearGesture(false); return; }
    if(gesture.active && event.cancelable) event.preventDefault();
  };
  window.addEventListener('pointermove', move, {passive: false});
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', escape, true);
  window.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', scroll);
  onMount(() => host.addEventListener('touchmove', touchMove, {passive: false}));
  createEffect(() => {
    const revision = props.revision, stepId = props.stepId, documentId = props.document.id, messageId = props.messageId;
    if(gesture && (gesture.revision !== revision || gesture.stepId !== stepId || gesture.messageId !== messageId || gesture.documentId !== documentId)) clearGesture(false);
  });
  onCleanup(() => {
    disposed = true; clearGesture(false); clearTimeout(suppressionTimer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', escape, true);
    window.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', scroll);
    host.removeEventListener('touchmove', touchMove);
  });

  return <div class="editable-keyboard" data-authored-message-id={props.messageId} classList={{'is-dragging': !!dragging()}} ref={element => { host = element; }}
    onContextMenu={event => {if(gesture?.touch) {event.preventDefault(); event.stopPropagation();}}}
    onLostPointerCapture={event => {
      // Touch transfers implicit capture from the button to this host. Its bubbling
      // loss belongs to the button, not to our active capture.
      if(event.target === host && gesture?.active && gesture.pointerId === event.pointerId && !host.hasPointerCapture(event.pointerId)) clearGesture(false);
    }}>
    <Keyboard rows={visualRows()} add={props.onAdd}
      onButton={(id, element) => { if(!suppressClick) props.onInspect(id, element); }}
      editing={{onPointerDown: begin, onKeyDown: keyMove, onContextMenu: openTarget, draggingId: dragging, linkTargetId: () => props.linkTargetButtonId ?? null}} />
    <Show when={dragging()}><div class="keyboard-drop-overlay" aria-hidden="true">
      <For each={gaps()}>{gap => <span class="keyboard-row-gap" data-keyboard-drop="new-row" data-gap-index={gap.index}
        classList={{'is-target': target()?.kind === 'new-row' && (target() as {index: number}).index === gap.index}}
        style={{top: `${gap.top}px`}} />}</For>
      <Show when={marker()}>{position => <span class="keyboard-insertion" data-keyboard-drop="insertion"
        style={{left: `${position().left}px`, top: `${position().top}px`, height: `${position().height}px`}} />}</Show>
    </div></Show>
    <span class="keyboard-drag-announcement" role="status" aria-live="polite">{announcement()}</span>
  </div>;
}
