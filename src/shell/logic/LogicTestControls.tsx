import {For, Show, createSignal, type JSX} from 'solid-js';
import type {JsonValue, RunTrace, ShellDocument} from '../core/types';
import {JsonInput, LiteralField, VariablePicker, defaultLiteral, variableType} from './fields';
import {logicLabels} from './LogicIcon';
import './Logic.scss';

export interface LogicTestControlsProps {
  document: ShellDocument;
  values: Record<string, JsonValue>;
  seedValues: Record<string, JsonValue>;
  trace: RunTrace[];
  virtualNow: number;
  waiting?: string;
  canAdvance?: boolean;
  failed?: boolean;
  canRetry?: boolean;
  onSetVariable(id: string, value: JsonValue): void;
  onAdvance(milliseconds: number): void;
  onEmit(name: string, data: JsonValue): void;
  onRetry(): void;
  onOpenBlock(blockId: string): void;
}
const statusNames: Record<RunTrace['status'], string> = {entered: 'Начало', succeeded: 'Готово', waiting: 'Ожидание', failed: 'Ошибка'};
function compact(value: JsonValue): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}
function formatTime(at: number): string {return new Date(at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'});}

export function LogicTestControls(props: LogicTestControlsProps): JSX.Element {
  const [variableId, setVariableId] = createSignal<string | null>('user.balance');
  const [seedDraft, setSeedDraft] = createSignal<JsonValue>(props.seedValues['user.balance'] ?? 0);
  const [eventName, setEventName] = createSignal('payment.completed');
  const [eventData, setEventData] = createSignal<JsonValue>({});
  function selectVariable(id: string | null): void {
    setVariableId(id); setSeedDraft(id ? props.seedValues[id] ?? defaultLiteral(variableType(props.document, id)) : '');
  }
  return <div class="logic-test-tools" data-testid="logic-test-controls">
    <Show when={props.waiting || props.failed}><div class="logic-test-toolbar logic-test-status" role="status">
      <span>{props.failed ? 'Выполнение остановлено' : props.waiting}</span>
      <Show when={props.canAdvance ?? !!props.waiting}><button type="button" data-testid="advance-logic-time" onClick={() => props.onAdvance(0)}>Пропустить ожидание</button></Show>
      <Show when={props.failed && props.canRetry !== false}><button type="button" data-testid="retry-logic-block" onClick={props.onRetry}>Повторить</button></Show>
    </div></Show>
    <details><summary>Проверка логики <span class="logic-test-clock">{formatTime(props.virtualNow)}</span></summary>
      <div class="logic-test-body">
        <details><summary>Данные нового теста</summary><form class="logic-fields" onSubmit={event => {
          event.preventDefault(); if(!event.currentTarget.reportValidity() || !variableId()) return;
          props.onSetVariable(variableId()!, structuredClone(seedDraft()));
        }}>
          <VariablePicker document={props.document} value={variableId()} writable label="Начальное значение" onChange={selectVariable}/>
          <Show when={variableId()} keyed>{id => <LiteralField value={seedDraft()} valueType={variableType(props.document, id)} onChange={setSeedDraft}/>}</Show>
          <div class="logic-test-toolbar"><button type="submit">Для следующего теста</button></div>
          <p class="logic-note">Текущее прохождение сохраняет свои значения. Новые начальные данные применятся после перезапуска.</p>
        </form></details>
        <details><summary>Переменные сейчас · {Object.keys(props.values).length}</summary><dl class="logic-current-values">
          <For each={Object.entries(props.values)}>{([id, value]) => <div><dt>{id}</dt><dd title={JSON.stringify(value)}>{compact(value)}</dd></div>}</For>
        </dl></details>
        <details><summary>Отправить событие в тест</summary><form class="logic-fields" onSubmit={event => {
          event.preventDefault(); if(event.currentTarget.reportValidity() && eventName().trim()) props.onEmit(eventName(), structuredClone(eventData()));
        }}>
          <label class="logic-field"><span>Имя события</span><input required value={eventName()} onInput={event => {
            event.currentTarget.setCustomValidity(event.currentTarget.value.trim() ? '' : 'Укажите имя события.'); setEventName(event.currentTarget.value);
          }}/></label>
          <label class="logic-field"><span>Данные события · JSON</span><JsonInput value={eventData()} onChange={setEventData}/></label>
          <div class="logic-test-toolbar"><button type="submit" data-testid="emit-logic-event">Отправить событие</button></div>
        </form></details>
        <div><div class="logic-section-heading">Выполненные элементы</div><Show when={props.trace.length} fallback={<p class="logic-note">Здесь появятся фактические шаги прохождения.</p>}>
          <ol class="logic-trace" data-testid="logic-trace"><For each={props.trace}>{entry => <li data-trace-status={entry.status}>
            <button type="button" onClick={() => props.onOpenBlock(entry.blockId)} disabled={!props.document.blocks[entry.blockId]}
              aria-label={`Открыть элемент: ${entry.detail || statusNames[entry.status]}`}>
              <time class="logic-trace-time">{formatTime(entry.at)}</time><span class="logic-trace-label"><strong>{logicLabels[props.document.blocks[entry.blockId]?.type ?? 'action']}</strong> · {statusNames[entry.status]}<Show when={entry.attempt > 1}> · попытка {entry.attempt}</Show><br/>{entry.detail}</span>
            </button>
          </li>}</For></ol>
        </Show></div>
      </div>
    </details>
  </div>;
}
