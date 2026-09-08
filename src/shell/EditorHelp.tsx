import {createEffect, createSignal, createUniqueId, type JSX, onCleanup, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {inspectorPosition} from './inspector-position';
import './EditorHelp.scss';

function HelpIcon(props: {kind: 'message' | 'button' | 'move'}): JSX.Element {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <Show when={props.kind === 'message'}><path d="M15 4H5a2 2 0 0 0-2 2v11l4-3h6"/><path d="m13 11 6-6 3 3-6 6-4 1 1-4Z"/></Show>
    <Show when={props.kind === 'button'}><rect x="3" y="4" width="18" height="7" rx="2"/><path d="M7 7.5h10"/><rect x="3" y="14" width="8" height="6" rx="2"/><rect x="14" y="14" width="7" height="6" rx="2"/></Show>
    <Show when={props.kind === 'move'}><path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></Show>
  </svg>;
}

/** Non-modal help: transient on hover/focus, pinned by an intentional click or tap. */
export function EditorHelp(props: {theme: 'day' | 'night'}): JSX.Element {
  const id = `editor-help-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  const [positioned, setPositioned] = createSignal(false);
  let trigger!: HTMLButtonElement;
  let panel: HTMLDivElement | undefined;
  let pinned = false, triggerHovered = false, panelHovered = false, triggerFocused = false;
  let pointerOpening = false, disposed = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  const viewport = window.visualViewport;

  function reveal(): void {
    clearTimeout(closeTimer);
    if(!open()) { setPositioned(false); setOpen(true); }
  }
  function dismiss(): void {
    clearTimeout(closeTimer);
    pinned = false; triggerHovered = false; panelHovered = false;
    setOpen(false);
  }
  function maybeClose(): void {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if(!pinned && !triggerHovered && !panelHovered && !triggerFocused) dismiss();
    }, 160);
  }
  function position(): void {
    if(disposed || !open() || !panel?.isConnected || !trigger.isConnected) return;
    const visible = {left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight};
    const anchor = trigger.getBoundingClientRect();
    // The existing positioning contract contains and flips the panel at every width.
    const initial = inspectorPosition(visible, anchor, 0, false);
    panel.style.width = `${initial.width}px`;
    const roomBelow = visible.top + visible.height - 16 - anchor.bottom - 10;
    // Help remains attached to the header in short windows; its own body scrolls.
    panel.style.maxHeight = `${roomBelow >= 180 ? Math.min(initial.maxHeight, roomBelow) : initial.maxHeight}px`;
    const alignedAnchor = {...anchor, left: anchor.right - initial.width,
      right: anchor.right, top: anchor.top, bottom: anchor.bottom};
    const result = inspectorPosition(visible, alignedAnchor, panel.getBoundingClientRect().height, false);
    panel.style.left = `${result.left}px`;
    panel.style.top = `${result.top}px`;
    panel.dataset.position = result.placement;
    setPositioned(true);
  }
  function schedulePosition(): void {
    if(disposed || !open() || frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; position(); });
  }
  function contains(target: EventTarget | null): boolean {
    return target instanceof Node && (trigger.contains(target) || !!panel?.contains(target));
  }
  function outside(event: Event): void { if(open() && !contains(event.target)) dismiss(); }
  function escape(event: KeyboardEvent): void {
    if(event.key !== 'Escape' || !open()) return;
    event.preventDefault(); event.stopPropagation();
    // Help never takes keyboard focus; dismissal leaves the active control intact.
    dismiss();
  }
  createEffect(() => {
    if(!open()) return;
    let active = true;
    let observer: ResizeObserver | undefined;
    queueMicrotask(() => {
      if(!active || disposed || !open() || !panel) return;
      position();
      observer = new ResizeObserver(schedulePosition);
      observer.observe(panel); observer.observe(trigger);
    });
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('focusin', outside);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('scroll', schedulePosition, true);
    viewport?.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('scroll', schedulePosition);
    onCleanup(() => {
      active = false;
      observer?.disconnect(); observer = undefined;
      if(frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('focusin', outside);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', schedulePosition);
      document.removeEventListener('scroll', schedulePosition, true);
      viewport?.removeEventListener('resize', schedulePosition);
      viewport?.removeEventListener('scroll', schedulePosition);
    });
  });
  onCleanup(() => { disposed = true; clearTimeout(closeTimer); });

  return <>
    <button type="button" class="editor-help-trigger" data-testid="editor-help-trigger"
      ref={element => { trigger = element; }} aria-label="Как редактировать бота"
      aria-expanded={open()} aria-describedby={open() ? id : undefined}
      onPointerEnter={event => { if(event.pointerType === 'mouse' && event.buttons === 0) { triggerHovered = true; reveal(); } }}
      onPointerLeave={event => { if(event.pointerType === 'mouse') { triggerHovered = false; maybeClose(); } }}
      onPointerDown={() => { pointerOpening = true; }}
      onFocus={() => {
        triggerFocused = true;
        // Touch focus precedes click; it must not consume the first tap's toggle.
        if(!pointerOpening || trigger.matches(':focus-visible')) reveal();
      }}
      onBlur={() => { triggerFocused = false; pointerOpening = false; maybeClose(); }}
      onClick={() => {
        pointerOpening = false;
        if(pinned) dismiss();
        else { pinned = true; reveal(); }
      }}>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="10" cy="10" r="7.3"/><path d="M10 9v5" stroke-linecap="round"/><circle cx="10" cy="6.3" r=".8" fill="currentColor" stroke="none"/>
      </svg>
    </button>
    <Show when={open()}><Portal>
      <div ref={element => { panel = element; }} id={id} role="tooltip" data-testid="editor-help"
        class="editor-help" classList={{night: props.theme === 'night', 'is-positioned': positioned()}}
        onPointerEnter={event => { if(event.pointerType === 'mouse') { panelHovered = true; clearTimeout(closeTimer); } }}
        onPointerLeave={event => { if(event.pointerType === 'mouse') { panelHovered = false; maybeClose(); } }}>
        <header class="editor-help-heading"><h2>Редактирование бота</h2></header>
        <div class="editor-help-items">
          <div class="editor-help-item"><span class="editor-help-symbol"><HelpIcon kind="message"/></span><div><h3>Сообщения</h3><p>Карандаш открывает текст, галочка завершает правку. В тесте можно дважды нажать на текст. В экран можно добавить несколько сообщений.</p></div></div>
          <div class="editor-help-item"><span class="editor-help-symbol"><HelpIcon kind="button"/></span><div><h3>Кнопки</h3><p>У каждого сообщения свои кнопки. Нажмите для настройки. В тесте: двойное нажатие, правая кнопка мыши или удержание.</p></div></div>
          <div class="editor-help-item"><span class="editor-help-symbol"><HelpIcon kind="move"/></span><div><h3>Порядок кнопок</h3><p>В редакторе перетащите кнопку мышью. На телефоне сначала удерживайте кнопку, затем двигайте. Линия между рядами создаёт новый ряд.</p></div></div>
        </div>
        <footer class="editor-help-shortcuts"><span><kbd>Alt</kbd> + <kbd>← ↑ ↓ →</kbd> порядок</span><span>С <kbd>Shift</kbd> + <kbd>↑ ↓</kbd> — новый ряд</span></footer>
      </div>
    </Portal></Show>
  </>;
}
