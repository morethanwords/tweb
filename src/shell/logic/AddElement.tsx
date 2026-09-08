import {For, Show, createEffect, createSignal, createUniqueId, onCleanup, type JSX} from 'solid-js';
import {Portal} from 'solid-js/web';
import {inspectorPosition} from '../inspector-position';
import {LogicIcon, logicLabels, type LogicElementKind} from './LogicIcon';
import './Logic.scss';

const elements: Array<{kind: LogicElementKind; detail: string}> = [
  {kind: 'message', detail: 'Текст и кнопки'},
  {kind: 'ask', detail: 'Получить и сохранить ответ'},
  {kind: 'decision', detail: 'Выбрать путь по условию'},
  {kind: 'action', detail: 'Изменить данные'},
  {kind: 'wait', detail: 'Продолжить позже'}
];
export interface AddElementProps {
  theme: 'day' | 'night';
  disabled?: boolean;
  compact?: boolean;
  onChoose(kind: LogicElementKind): void;
  onBeforeOpen?(): boolean | void;
}

/** Owns only the chooser. A selection asks the parent to create a pending draft. */
export function AddElement(props: AddElementProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [positioned, setPositioned] = createSignal(false);
  const menuId = `add-element-${createUniqueId()}`;
  let trigger!: HTMLButtonElement;
  let panel: HTMLDivElement | undefined;
  let frame: number | undefined;
  let disposed = false;
  const viewport = window.visualViewport;
  function close(restore = false): void {
    if(restore && trigger.isConnected) trigger.focus({preventScroll: true});
    setOpen(false);
  }
  function position(): void {
    if(disposed || !open() || !panel?.isConnected) return;
    const visible = {left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight};
    const anchor = trigger.getBoundingClientRect();
    const first = inspectorPosition(visible, anchor, 0, false);
    panel.style.width = `${Math.min(290, first.width)}px`;
    panel.style.maxHeight = `${first.maxHeight}px`;
    const width = panel.getBoundingClientRect().width;
    const bounds = inspectorPosition(visible, {left: anchor.left, right: anchor.left + width,
      top: anchor.top, bottom: anchor.bottom}, panel.getBoundingClientRect().height, false);
    panel.style.left = `${Math.max(visible.left + 12, Math.min(anchor.left, visible.left + visible.width - width - 12))}px`;
    panel.style.top = `${bounds.top}px`;
    setPositioned(true);
  }
  function schedule(): void {
    if(frame !== undefined) return;
    frame = requestAnimationFrame(() => {frame = undefined; position();});
  }
  function outside(event: Event): void {
    if(event.target instanceof Node && !trigger.contains(event.target) && !panel?.contains(event.target)) close();
  }
  createEffect(() => {if(props.disabled) close();});
  createEffect(() => {
    if(!open()) return;
    let live = true;
    let observer: ResizeObserver | undefined;
    queueMicrotask(() => {
      if(!live || disposed || !panel) return;
      position(); panel.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
      observer = new ResizeObserver(schedule); observer.observe(panel);
    });
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('focusin', outside);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    onCleanup(() => {
      live = false; observer?.disconnect();
      if(frame !== undefined) {cancelAnimationFrame(frame); frame = undefined;}
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('focusin', outside);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    });
  });
  onCleanup(() => {disposed = true;});
  function keys(event: KeyboardEvent): void {
    if(event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); close(true); return;}
    if(event.key === 'Tab') {close(true); return;}
    const choices = Array.from(panel?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = choices.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'ArrowDown' ? (at + 1) % choices.length
      : event.key === 'ArrowUp' ? (at - 1 + choices.length) % choices.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : -1;
    if(index >= 0) {event.preventDefault(); choices[index]?.focus();}
  }
  return <div class="logic-add-element">
    <button type="button" ref={element => {trigger = element;}} class="logic-add-trigger" data-testid="add-element"
      aria-label="Добавить элемент" title={props.compact ? 'Добавить элемент' : undefined}
      disabled={props.disabled} aria-haspopup="menu" aria-expanded={open()} aria-controls={open() ? menuId : undefined}
      onClick={() => {
        if(open()) {close(true); return;}
        if(props.onBeforeOpen?.() === false) return;
        setPositioned(false); setOpen(true);
      }}><span aria-hidden="true">＋</span><Show when={!props.compact}>Добавить элемент</Show></button>
    <Show when={open()}><Portal><div ref={element => {panel = element;}} id={menuId} role="menu"
      aria-label="Добавить элемент" class="logic-element-menu logic-themed" classList={{night: props.theme === 'night', 'is-positioned': positioned()}}
      data-testid="add-element-menu" onKeyDown={keys}>
      <For each={elements}>{item => <button type="button" role="menuitem" data-testid={`add-element-${item.kind}`}
        onClick={() => {close(true); if(!props.disabled) props.onChoose(item.kind);}}>
        <span class="logic-element-symbol"><LogicIcon kind={item.kind}/></span><span><strong>{logicLabels[item.kind]}</strong><small>{item.detail}</small></span>
      </button>}</For>
    </div></Portal></Show>
  </div>;
}
