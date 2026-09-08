/* Native row/corner markup from morethanwords/tweb 4a82cc7. GPL-3.0-only.
 * Telegram wrapper, rootScope and settings imports are deliberately absent. */
import {For, JSX, onCleanup, Show} from 'solid-js';
import type {ButtonColor} from '../core/types';

export interface VisualKeyboardRow {
  id: string;
  buttons: {id: string; label: string; disabled?: boolean; color?: ButtonColor}[];
}
export interface KeyboardProps {
  rows: VisualKeyboardRow[];
  onButton: (id: string, element: HTMLButtonElement) => void;
  add?: () => void;
  addLinkTarget?: boolean;
  editing?: {
    onPointerDown: (id: string, element: HTMLButtonElement, event: PointerEvent) => void;
    onKeyDown: (id: string, event: KeyboardEvent) => void;
    onContextMenu?: (id: string, element: HTMLButtonElement, event: MouseEvent) => void;
    draggingId: () => string | null;
    linkTargetId?: () => string | null;
  };
  testEditing?: {
    onClick: (id: string, element: HTMLButtonElement, event: MouseEvent) => void;
    onDoubleClick: (id: string, element: HTMLButtonElement, event: MouseEvent) => void;
    onContextMenu: (id: string, element: HTMLButtonElement, event: MouseEvent) => void;
    onPointerDown: (id: string, element: HTMLButtonElement, event: PointerEvent) => void;
    onKeyDown: (id: string, element: HTMLButtonElement, event: KeyboardEvent) => void;
  };
}

function NativeButton(props: {
  id: string; label: string; disabled?: boolean; color?: ButtonColor; first: boolean; last: boolean;
  onButton: KeyboardProps['onButton'];
  editing?: KeyboardProps['editing'];
  testEditing?: KeyboardProps['testEditing'];
}): JSX.Element {
  let button!: HTMLButtonElement;
  const effects = new Set<{node: HTMLSpanElement; timer: ReturnType<typeof setTimeout>}>();
  const dispose = () => {
    for(const effect of effects) { clearTimeout(effect.timer); effect.node.remove(); }
    effects.clear();
  };
  onCleanup(dispose);
  const ripple = (event: PointerEvent) => {
    if(props.disabled || event.button !== 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = button.getBoundingClientRect();
    const size = Math.hypot(bounds.width, bounds.height) * 2;
    const node = document.createElement('span');
    node.className = 'shell-ripple-circle';
    node.setAttribute('aria-hidden', 'true');
    node.style.width = node.style.height = `${size}px`;
    node.style.left = `${event.clientX - bounds.left - size / 2}px`;
    node.style.top = `${event.clientY - bounds.top - size / 2}px`;
    button.append(node);
    const effect = {node, timer: setTimeout(() => { node.remove(); effects.delete(effect); }, 450)};
    effects.add(effect);
  };
  return <button
    ref={element => {button = element;}}
    type="button"
    class={`reply-markup-button rp ${props.first ? 'is-first' : ''} ${props.last ? 'is-last' : ''} ${props.editing?.linkTargetId?.() === props.id ? 'is-link-target' : ''}`}
    data-button-id={props.id}
    data-button-color={props.color && props.color !== 'default' ? props.color : undefined}
    data-dragging={props.editing?.draggingId() === props.id ? 'true' : undefined}
    aria-description={props.editing ? 'Нажмите для настройки. Перетащите мышью или удерживайте на телефоне для перемещения. Alt и стрелки меняют порядок; Alt, Shift и стрелка вверх или вниз создают ряд.' : props.testEditing ? 'Нажмите для перехода. Двойное нажатие, правая кнопка мыши или удержание открывают настройку.' : undefined}
    disabled={props.disabled && !props.testEditing}
    aria-disabled={props.testEditing && props.disabled ? 'true' : undefined}
    onPointerDown={event => { ripple(event); props.editing?.onPointerDown(props.id, event.currentTarget, event); props.testEditing?.onPointerDown(props.id, event.currentTarget, event); }}
    onKeyDown={event => { props.editing?.onKeyDown(props.id, event); props.testEditing?.onKeyDown(props.id, event.currentTarget, event); }}
    onClick={event => { event.stopPropagation(); if(props.testEditing) props.testEditing.onClick(props.id, event.currentTarget, event); else props.onButton(props.id, event.currentTarget); }}
    onDblClick={event => props.testEditing?.onDoubleClick(props.id, event.currentTarget, event)}
    onContextMenu={event => {
      if(props.editing?.onContextMenu) props.editing.onContextMenu(props.id, event.currentTarget, event);
      else props.testEditing?.onContextMenu(props.id, event.currentTarget, event);
    }}
  ><span class="reply-markup-button-text">{props.label || 'Без названия'}</span></button>;
}

export default function Keyboard(props: KeyboardProps): JSX.Element {
  return <>
    <Show when={props.rows.length > 0}>
      <div class="reply-markup">
        <For each={props.rows}>{(row, rowIndex) => <div class="reply-markup-row" data-row-id={row.id}>
          <For each={row.buttons}>{(button, index) => <NativeButton
            id={button.id} label={button.label} disabled={button.disabled} color={button.color}
            first={rowIndex() === props.rows.length - 1 && index() === 0}
            last={rowIndex() === props.rows.length - 1 && index() === row.buttons.length - 1}
            onButton={props.onButton}
            editing={props.editing}
            testEditing={props.testEditing}
          />}</For>
        </div>}</For>
      </div>
    </Show>
    <Show when={props.add}><button type="button" class="shell-add-button" classList={{'is-link-target': props.addLinkTarget}} onClick={(event) => { event.stopPropagation(); props.add?.(); }}>＋ Добавить кнопку</button></Show>
  </>;
}
