import {createSignal, onCleanup, Show, type JSX} from 'solid-js';
import {Portal} from 'solid-js/web';

export function BlockGrip(props: {blockId: string; targetIds: string[]; version: object; label: string; disabled?: boolean; onMove(direction: -1 | 1): void; onReorder(targetId: string, after: boolean): void}): JSX.Element {
  const [ghost, setGhost] = createSignal<{x: number; y: number} | null>(null);
  let handle!: HTMLButtonElement;
  let active: {pointerId: number; x: number; y: number; started: boolean; targets: string[]; version: object} | null = null;
  let target: {id: string; after: boolean; element: HTMLElement} | null = null;
  function clearTarget(): void {target?.element.removeAttribute('data-logic-drop'); target = null;}
  function finish(commit: boolean): void {
    const gesture = active, drop = target; active = null; clearTarget(); setGhost(null);
    if(gesture && handle.hasPointerCapture(gesture.pointerId)) handle.releasePointerCapture(gesture.pointerId);
    window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', keys, true);
    if(commit && gesture?.started && drop && !props.disabled && gesture.version === props.version && props.targetIds.includes(drop.id)) props.onReorder(drop.id, drop.after);
  }
  function move(event: PointerEvent): void {
    if(!active || event.pointerId !== active.pointerId) return;
    if(props.disabled) {finish(false); return;}
    if(!active.started && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
    active.started = true; event.preventDefault(); setGhost({x: event.clientX, y: event.clientY});
    const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-block-id]');
    clearTarget();
    if(!candidate || candidate.dataset.blockId === props.blockId || !active.targets.includes(candidate.dataset.blockId ?? '')) return;
    const bounds = candidate.getBoundingClientRect();
    const after = event.clientY >= bounds.top + bounds.height / 2;
    target = {id: candidate.dataset.blockId!, element: candidate, after}; candidate.dataset.logicDrop = after ? 'after' : 'before';
  }
  function up(event: PointerEvent): void {
    if(active?.pointerId !== event.pointerId) return;
    // Scrolling may move the cards without another pointermove event.
    move(event);
    event.preventDefault(); finish(true);
  }
  function cancel(): void {finish(false);}
  function keys(event: KeyboardEvent): void {if(event.key === 'Escape') {event.preventDefault(); finish(false);}}
  onCleanup(cancel);
  return <>
    <button type="button" class="logic-card-grip" ref={element => {handle = element;}} disabled={props.disabled}
      aria-label={`Переместить ${props.label.toLowerCase()}`} title="Перетащить · Alt + ↑ / ↓" data-testid={`block-grip-${props.blockId}`}
      onPointerDown={event => {
        if(props.disabled || event.button !== 0 || !event.isPrimary) return;
        finish(false); event.preventDefault(); handle.focus({preventScroll: true});
        active = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false, targets: [...props.targetIds], version: props.version};
        handle.setPointerCapture(event.pointerId);
        window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel); window.addEventListener('keydown', keys, true);
      }} onLostPointerCapture={event => {if(event.target === handle && active?.pointerId === event.pointerId && !handle.hasPointerCapture(event.pointerId)) finish(false);}}
      onKeyDown={event => {if(event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {event.preventDefault(); if(!props.disabled) props.onMove(event.key === 'ArrowUp' ? -1 : 1);}}}>
      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1"/><circle cx="8" cy="4" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/><circle cx="4" cy="14" r="1"/><circle cx="8" cy="14" r="1"/></svg>
    </button>
    <Show when={ghost()}>{point => <Portal><div class="logic-drag-ghost" style={{left: `${point().x + 12}px`, top: `${point().y + 10}px`}} aria-hidden="true">{props.label}</div></Portal>}</Show>
  </>;
}
