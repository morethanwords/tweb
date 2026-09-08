import {createEffect, createSignal, createUniqueId, type JSX, onCleanup, Show, untrack} from 'solid-js';
import {Portal} from 'solid-js/web';
import './MessageActions.scss';

interface MenuSnapshot {
  x: number; y: number; text: string; width: number;
  onEdit?: (width: number) => void;
  returnFocus: HTMLElement | null;
}
export interface MessageActionsProps {
  text: string;
  onEdit?: (bubbleWidth: number) => void;
  children: JSX.Element;
  theme: 'day' | 'night';
  disabled?: boolean;
}

function ActionIcon(props: {edit?: boolean}): JSX.Element {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <Show when={props.edit} fallback={<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></>}>
      <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z"/>
    </Show>
  </svg>;
}

function legacyCopy(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const textarea = document.createElement('textarea');
  textarea.value = text; textarea.readOnly = true; textarea.tabIndex = -1;
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, {position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0'});
  document.body.append(textarea);
  try {
    textarea.focus({preventScroll: true}); textarea.select();
    return document.execCommand('copy');
  } catch { return false; }
  finally {
    textarea.remove();
    if(active?.isConnected) active.focus({preventScroll: true});
    if(selection) {
      selection.removeAllRanges();
      for(const range of ranges) if(range.commonAncestorContainer.isConnected) selection.addRange(range);
    }
  }
}

/** Local message context actions. Clipboard is only written by the explicit Copy action. */
export function MessageActions(props: MessageActionsProps): JSX.Element {
  const menuId = `message-actions-${createUniqueId()}`;
  const [menu, setMenu] = createSignal<MenuSnapshot | null>(null);
  const [positioned, setPositioned] = createSignal(false);
  const [copyState, setCopyState] = createSignal<'idle' | 'pending' | 'copied' | 'error'>('idle');
  let host!: HTMLDivElement, panel: HTMLDivElement | undefined;
  let hold: {pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout>} | null = null;
  let guardPointerId: number | null = null;
  let guardTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  let disposed = false;
  const viewport = window.visualViewport;
  const excluded = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('button, input, textarea, select, a, [contenteditable]:not([contenteditable="false"]), [role="button"]');

  function close(restoreFocus = false): void {
    const previous = menu();
    setMenu(null);
    if(restoreFocus) queueMicrotask(() => {
      if(!disposed && !menu()) {
        const target = previous?.returnFocus?.isConnected ? previous.returnFocus : host;
        target?.focus({preventScroll: true});
      }
    });
  }
  function openAt(x: number, y: number): void {
    if(disposed || props.disabled) return;
    const width = host.querySelector<HTMLElement>('.bubble-content-wrapper')?.getBoundingClientRect().width ?? host.getBoundingClientRect().width;
    setPositioned(false); setCopyState('idle');
    setMenu({x, y, text: props.text, width, onEdit: props.onEdit,
      returnFocus: document.activeElement instanceof HTMLElement && host.contains(document.activeElement) ? document.activeElement : host});
  }
  function position(): void {
    const current = menu();
    if(!current || disposed || !panel?.isConnected) return;
    const visible = {left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight};
    const margin = Math.min(12, visible.width / 2, visible.height / 2);
    const width = Math.min(248, Math.max(0, visible.width - margin * 2));
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, visible.height - margin * 2)}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.left = `${Math.max(visible.left + margin, Math.min(current.x + 2, visible.left + visible.width - width - margin))}px`;
    panel.style.top = `${Math.max(visible.top + margin, Math.min(current.y + 2, visible.top + visible.height - height - margin))}px`;
    setPositioned(true);
  }
  function schedulePosition(): void {
    if(disposed || !menu() || frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; position(); });
  }
  function clearGuard(): void {
    guardPointerId = null; clearTimeout(guardTimer);
    window.removeEventListener('click', guardClick, true);
    window.removeEventListener('pointerup', releaseGuard, true);
    window.removeEventListener('pointerdown', clearGuard, true);
  }
  function guardClick(event: MouseEvent): void {
    if(guardPointerId === null) return;
    event.preventDefault(); event.stopPropagation(); clearGuard();
  }
  function releaseGuard(event: PointerEvent): void {
    if(event.pointerId !== guardPointerId) return;
    guardTimer = setTimeout(clearGuard, 0);
  }
  function installGuard(pointerId: number): void {
    clearGuard(); guardPointerId = pointerId;
    window.addEventListener('click', guardClick, true);
    window.addEventListener('pointerup', releaseGuard, true);
    window.addEventListener('pointerdown', clearGuard, true);
  }
  function cancelHold(): void {
    if(hold) clearTimeout(hold.timer);
    hold = null;
    window.removeEventListener('pointermove', moveHold);
    window.removeEventListener('pointerup', endHold);
    window.removeEventListener('pointercancel', endHold);
    window.removeEventListener('blur', cancelHold);
    document.removeEventListener('scroll', cancelHold, true);
  }
  function moveHold(event: PointerEvent): void {
    if(hold && event.pointerId === hold.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold();
  }
  function endHold(event: PointerEvent): void { if(event.pointerId === hold?.pointerId) cancelHold(); }
  function beginHold(event: PointerEvent): void {
    if(props.disabled || event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0 || excluded(event.target)) return;
    cancelHold();
    const {pointerId, clientX: x, clientY: y} = event;
    hold = {pointerId, x, y, timer: setTimeout(() => {
      if(hold?.pointerId !== pointerId) return;
      if(props.disabled) { cancelHold(); return; }
      cancelHold(); installGuard(pointerId); openAt(x, y);
    }, 500)};
    window.addEventListener('pointermove', moveHold);
    window.addEventListener('pointerup', endHold);
    window.addEventListener('pointercancel', endHold);
    window.addEventListener('blur', cancelHold);
    document.addEventListener('scroll', cancelHold, true);
  }
  async function copy(): Promise<void> {
    const current = menu();
    if(props.disabled || !current || copyState() === 'pending') return;
    setCopyState('pending');
    let copied = false;
    try {
      if(!navigator.clipboard?.writeText) throw new Error('Clipboard write unavailable');
      await navigator.clipboard.writeText(current.text);
      copied = true;
    } catch { if(!disposed && menu() === current) copied = legacyCopy(current.text); }
    if(!disposed && menu() === current) setCopyState(copied ? 'copied' : 'error');
  }
  function edit(): void {
    const current = menu();
    if(props.disabled || !current?.onEdit) return;
    close(); current.onEdit(current.width);
  }
  function menuKey(event: KeyboardEvent): void {
    if(!menu()) return;
    if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clearGuard(); close(true); }
    else if(event.key === 'Tab') {
      // Restore a connected origin before unmounting the focused portal item.
      // Native Tab/Shift+Tab can then continue in the document's normal order.
      const origin = menu()?.returnFocus;
      (origin?.isConnected ? origin : host).focus({preventScroll: true});
      clearGuard(); close();
    }
    else if(['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); clearGuard();
      const items = [...panel!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      const index = items.findIndex(item => item === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({preventScroll: true});
    }
  }
  function outside(event: PointerEvent): void {
    if(menu() && event.target instanceof Node && !panel?.contains(event.target)) close();
  }
  function scrollMenu(event: Event): void {
    if(event.target instanceof Node && panel?.contains(event.target)) return;
    close();
  }
  createEffect(() => {
    if(props.disabled) {
      cancelHold(); clearGuard();
      // Closing a portal must not move focus or commit an active IME session.
      untrack(() => close());
    }
  });
  createEffect(() => {
    const current = menu();
    if(!current) return;
    let active = true;
    let observer: ResizeObserver | undefined;
    queueMicrotask(() => {
      if(!active || disposed || menu() !== current || !panel) return;
      position();
      panel.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({preventScroll: true});
      observer = new ResizeObserver(schedulePosition); observer.observe(panel);
    });
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', menuKey, true);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('scroll', scrollMenu, true);
    viewport?.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('scroll', schedulePosition);
    onCleanup(() => {
      active = false; observer?.disconnect();
      if(frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', menuKey, true);
      window.removeEventListener('resize', schedulePosition);
      document.removeEventListener('scroll', scrollMenu, true);
      viewport?.removeEventListener('resize', schedulePosition);
      viewport?.removeEventListener('scroll', schedulePosition);
    });
  });
  onCleanup(() => { disposed = true; cancelHold(); clearGuard(); });

  return <div class="message-actions-host" ref={element => { host = element; }} tabindex="0"
    role="group" aria-label="Действия с сообщением" aria-haspopup="menu" aria-controls={menu() ? menuId : undefined}
    onPointerDown={beginHold} onContextMenu={event => {
      if(excluded(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      if(props.disabled) return;
      const heldPointer = hold?.pointerId;
      cancelHold();
      if(heldPointer !== undefined) installGuard(heldPointer);
      if(menu()) return;
      openAt(event.clientX, event.clientY);
    }}
    onKeyDown={event => {
      if(excluded(event.target)) return;
      if(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation();
        if(props.disabled) return;
        cancelHold(); clearGuard();
        const bounds = host.querySelector('.bubble-content')?.getBoundingClientRect() ?? host.getBoundingClientRect();
        openAt(bounds.left + Math.min(80, bounds.width / 2), bounds.top + Math.min(30, bounds.height / 2));
      }
    }}>
    {props.children}
    <Show when={menu()}><Portal>
      <div id={menuId} ref={element => { panel = element; }} role="menu" aria-label="Действия с сообщением"
        class="message-context-menu" classList={{night: props.theme === 'night', 'is-positioned': positioned()}}
        data-testid="message-context-menu">
        <button type="button" role="menuitem" class="message-context-item" aria-disabled={copyState() === 'pending'} onClick={copy}><ActionIcon/><span>Копировать текст</span></button>
        <Show when={menu()?.onEdit}><button type="button" role="menuitem" class="message-context-item" onClick={edit}><ActionIcon edit/><span>Редактировать сообщение</span></button></Show>
        <Show when={copyState() !== 'idle'}><p class="message-copy-result" classList={{error: copyState() === 'error'}} role="status">
          {copyState() === 'pending' ? 'Копирование…' : copyState() === 'copied' ? 'Текст скопирован' : 'Не удалось скопировать. Выделите текст вручную.'}
        </p></Show>
      </div>
    </Portal></Show>
  </div>;
}
