import {Show, type JSX} from 'solid-js';

export type LogicElementKind = 'message' | 'ask' | 'decision' | 'action' | 'wait' | 'code';
export const logicLabels: Record<LogicElementKind, string> = {
  message: 'Сообщение', ask: 'Вопрос', decision: 'Условие', action: 'Действие', wait: 'Ожидание', code: 'Код'
};
export function LogicIcon(props: {kind: LogicElementKind; size?: number}): JSX.Element {
  return <svg width={props.size ?? 19} height={props.size ?? 19} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <Show when={props.kind === 'message'}><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 3V6a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h7"/></Show>
    <Show when={props.kind === 'ask'}><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16h.01"/><circle cx="12" cy="12" r="9"/></Show>
    <Show when={props.kind === 'decision'}><path d="m12 3 7 6-7 6-7-6 7-6Zm0 12v3M5 21v-3h14v3"/></Show>
    <Show when={props.kind === 'action'}><path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/></Show>
    <Show when={props.kind === 'wait'}><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></Show>
    <Show when={props.kind === 'code'}><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></Show>
  </svg>;
}
