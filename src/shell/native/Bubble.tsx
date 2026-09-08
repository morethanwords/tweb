/* Derived from morethanwords/tweb at 4a82cc7. GPL-3.0-only.
 * Original markup: components/chat/bubbles.ts and chat/utils.ts. */
import {children, createEffect, createSignal, JSX, Show} from 'solid-js';

export interface BubbleProps {
  text: string;
  outgoing?: boolean;
  time?: string;
  children?: JSX.Element;
  hasKeyboard?: boolean;
  avatar?: boolean;
  class?: string;
  onEdit?: (bubbleWidth: number) => void;
  showEditAction?: boolean;
  onFinishEdit?: () => void;
  onDelete?: () => void;
  editorWidth?: number;
  groupFirst?: boolean;
  groupLast?: boolean;
  editor?: JSX.Element;
}

export function Tail(): JSX.Element {
  return <svg class="bubble-tail" viewBox="0 0 11 20" width="11" height="20" aria-hidden="true">
    <g transform="translate(9 -14)" fill="inherit" fill-rule="evenodd">
      <path d="M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z" transform="matrix(1 0 0 -1 0 49)" fill="inherit" />
    </g>
  </svg>;
}

export default function Bubble(props: BubbleProps): JSX.Element {
  let wrapper!: HTMLDivElement;
  const [editingWidth, setEditingWidth] = createSignal<number>();
  const resolvedChildren = children(() => props.children);
  const resolvedEditor = children(() => props.editor);
  const hasEditor = () => {
    const value = resolvedEditor();
    return Array.isArray(value) ? value.length > 0 : !!value;
  };
  const hasChildren = () => {
    if(props.hasKeyboard !== undefined) return props.hasKeyboard;
    const value = resolvedChildren();
    return Array.isArray(value) ? value.length > 0 : !!value;
  };
  const showEditAction = () => !!props.onEdit && props.showEditAction !== false;
  const excludedFromEditing = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('button, input, textarea, select, a, [contenteditable]:not([contenteditable="false"]), [role="button"]');
  const beginEditing = () => {
    const width = wrapper.getBoundingClientRect().width;
    setEditingWidth(width);
    props.onEdit?.(width);
  };
  createEffect(() => {if(!hasEditor()) setEditingWidth(undefined);});
  return <div class={`bubble ${props.groupFirst !== false ? 'is-group-first' : ''} ${props.groupLast !== false ? 'is-group-last can-have-tail' : ''} ${props.outgoing ? 'is-out' : 'is-in'} ${hasChildren() ? 'with-reply-markup' : ''} ${props.avatar ? 'shell-with-avatar' : ''} ${props.class || ''}`}>
    <Show when={props.avatar}><span class="avatar avatar-like avatar-gradient shell-message-avatar" aria-label="AI Generated Bot">AI</span></Show>
    <div ref={element => {wrapper = element;}} class="bubble-content-wrapper" classList={{'with-edit-action': showEditAction()}} style={hasEditor() && (props.editorWidth ?? editingWidth()) ? {width: `${props.editorWidth ?? editingWidth()}px`} : undefined}
      onDblClick={event => {
        if(!props.onEdit || hasEditor() || excludedFromEditing(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        beginEditing();
      }}>
      <div class="bubble-content">
        <Show when={props.groupLast !== false}><Tail /></Show>
        <div class="message spoilers-container">
          <Show when={hasEditor()} fallback={<span class="message-text">{props.text || '\u200b'}</span>}>{resolvedEditor()}</Show>
          <span class="time" aria-label={props.time || '12:00'}>{props.time || '12:00'}<span class="time-inner" aria-hidden="true">{props.time || '12:00'}</span></span>
          <span class="clearfix" aria-hidden="true" />
        </div>
      </div>
      <Show when={showEditAction()}><button type="button" class="bubble-edit-action" classList={{'is-editing': hasEditor()}} aria-label={hasEditor() ? 'Готово' : 'Изменить текст сообщения'} title={hasEditor() ? 'Завершить редактирование' : 'Изменить сообщение'} onPointerDown={event => {if(hasEditor()) event.preventDefault();}} onClick={event => {
        event.stopPropagation();
        if(hasEditor()) props.onFinishEdit?.();
        else beginEditing();
      }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><Show when={hasEditor()} fallback={<path d="m16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-3L4 16z" />}><path d="m5 12 4 4L19 6" /></Show></svg>
      </button></Show>
      <Show when={hasEditor() && props.onDelete}><button type="button" class="bubble-delete-action" aria-label="Удалить сообщение" title="Удалить сообщение" onPointerDown={event => event.preventDefault()} onClick={event => {event.stopPropagation(); props.onDelete?.();}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>
      </button></Show>
      {resolvedChildren()}
    </div>
  </div>;
}
