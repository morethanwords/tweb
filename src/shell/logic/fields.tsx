import {For, Index, Show, createEffect, createSignal, type JSX} from 'solid-js';
import {allStepIds, stepReference} from '../core/navigation';
import type {JsonValue, ShellDocument, Transition, ValueSource, ValueType, VariableDefinition, VariableScope} from '../core/types';

const scopes: Array<{id: VariableScope; label: string}> = [
  {id: 'user', label: 'Пользователь'}, {id: 'conversation', label: 'Разговор'}, {id: 'run', label: 'Прохождение'},
  {id: 'bot', label: 'Бот'}, {id: 'event', label: 'Событие'}, {id: 'system', label: 'Система'}
];
const typeLabels: Record<ValueType, string> = {string: 'текст', number: 'число', boolean: 'да / нет', json: 'JSON'};
export function defaultLiteral(type: ValueType = 'string'): JsonValue {
  return type === 'number' ? 0 : type === 'boolean' ? false : type === 'json' ? {} : '';
}
export function variableType(document: ShellDocument, id: string | null): ValueType {
  return id ? document.variables[id]?.valueType ?? 'string' : 'string';
}
export function variableLabel(document: ShellDocument, id: string): string {
  return document.variables[id]?.label || id || 'Выбрать переменную';
}
export function writableVariable(variable: VariableDefinition): boolean {
  return variable.scope !== 'system' && variable.scope !== 'event';
}
export interface VariablePickerProps {
  document: ShellDocument;
  value: string | null;
  onChange(value: string | null): void;
  types?: ValueType[];
  writable?: boolean;
  allowEmpty?: boolean;
  label?: string;
}
export function VariablePicker(props: VariablePickerProps): JSX.Element {
  const options = () => Object.values(props.document.variables).filter(item => (!props.types || props.types.includes(item.valueType))
    && (!props.writable || writableVariable(item)));
  return <label class="logic-field"><span>{props.label ?? 'Переменная'}</span><select value={props.value ?? ''}
    required={!props.allowEmpty} onChange={event => props.onChange(event.currentTarget.value || null)}>
    <option value="" disabled={!props.allowEmpty}>{props.allowEmpty ? 'Не сохранять' : 'Выбрать переменную'}</option>
    <For each={scopes}>{scope => <Show when={options().some(item => item.scope === scope.id)}><optgroup label={scope.label}>
      <For each={options().filter(item => item.scope === scope.id)}>{item => <option value={item.id} title={item.id}>{item.label} · {typeLabels[item.valueType]}</option>}</For>
    </optgroup></Show>}</For>
  </select></label>;
}
export interface TransitionFieldProps {
  document: ShellDocument;
  value: Transition | null;
  onChange(value: Transition | null): void;
  label?: string;
  allowUnset?: boolean;
  unsetLabel?: string;
}
export function TransitionField(props: TransitionFieldProps): JSX.Element {
  const value = () => !props.value ? '' : props.value.type === 'screen' ? `screen:${props.value.screenId}` : props.value.type;
  return <label class="logic-field"><span>{props.label ?? 'Продолжить'}</span><select value={value()} required={!props.allowUnset}
    onChange={event => {
      const value = event.currentTarget.value;
      props.onChange(value.startsWith('screen:') ? {type: 'screen', screenId: value.slice(7)}
        : value === 'end' ? {type: 'end'} : value === 'continue' ? {type: 'continue'} : null);
    }}>
    <Show when={props.allowUnset}><option value="">{props.unsetLabel ?? 'Не настроено'}</option></Show>
    <option value="continue">Следующий элемент</option><option value="end">Завершить путь</option>
    <optgroup label="Перейти на экран"><For each={allStepIds(props.document)}>{id => <option value={`screen:${id}`}>{stepReference(props.document, id)}</option>}</For></optgroup>
  </select></label>;
}
export function LiteralField(props: {value: JsonValue; valueType: ValueType; onChange(value: JsonValue): void; label?: string}): JSX.Element {
  return <label class="logic-field"><span>{props.label ?? 'Значение'}</span>
    <Show when={props.valueType === 'boolean'}><select value={String(props.value === true)} onChange={event => props.onChange(event.currentTarget.value === 'true')}>
      <option value="true">Да</option><option value="false">Нет</option>
    </select></Show>
    <Show when={props.valueType === 'string'}><input type="text" value={typeof props.value === 'string' ? props.value : ''} onInput={event => props.onChange(event.currentTarget.value)}/></Show>
    <Show when={props.valueType === 'number'}><input type="number" step="any" required value={typeof props.value === 'number' ? props.value : ''}
      onInput={event => {const input = event.currentTarget; if(input.value !== '' && Number.isFinite(input.valueAsNumber)) props.onChange(input.valueAsNumber);}}/></Show>
    <Show when={props.valueType === 'json'}><JsonInput value={props.value} onChange={props.onChange}/></Show>
  </label>;
}
/** Invalid input stays visible and blocks the containing form; the last valid value is never silently submitted. */
export function JsonInput(props: {value: JsonValue; onChange(value: JsonValue): void; objectOnly?: boolean; label?: string; validate?(value: JsonValue): string | null}): JSX.Element {
  const [text, setText] = createSignal(JSON.stringify(props.value, null, 2));
  let lastValue = props.value;
  let input: HTMLTextAreaElement | undefined;
  createEffect(() => {
    const value = props.value;
    if(value === lastValue) return;
    lastValue = value;
    setText(JSON.stringify(value, null, 2));
    input?.setCustomValidity(''); input?.removeAttribute('aria-invalid');
  });
  return <textarea class="logic-json" ref={element => {input = element;}} aria-label={props.label} value={text()} spellcheck={false}
    onInput={event => {
      const input = event.currentTarget; setText(input.value);
      try {
        const value: JsonValue = JSON.parse(input.value);
        if(props.objectOnly && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Нужен JSON-объект.');
        const issue = props.validate?.(value); if(issue) throw new Error(issue);
        input.setCustomValidity(''); input.removeAttribute('aria-invalid'); lastValue = value; props.onChange(value);
      } catch(error) {
        input.setCustomValidity(error instanceof SyntaxError ? props.objectOnly ? 'Введите корректный JSON-объект.' : 'Введите корректный JSON.' : error instanceof Error ? error.message : 'Некорректное значение.');
        input.setAttribute('aria-invalid', 'true');
      }
    }}/>;
}
export function ValueSourceField(props: {document: ShellDocument; value: ValueSource; valueType?: ValueType; onChange(value: ValueSource): void; label?: string}): JSX.Element {
  const literalType = (): ValueType => {
    if(props.valueType) return props.valueType;
    if(props.value.type !== 'literal') return 'string';
    const type = typeof props.value.value;
    return type === 'number' || type === 'boolean' || type === 'string' ? type : 'json';
  };
  return <div class="logic-value-source">
    <Show when={props.value.type === 'literal'}><LiteralField value={props.value.type === 'literal' ? props.value.value : ''}
      valueType={literalType()} onChange={value => props.onChange({type: 'literal', value})} label={props.label ?? 'Значение'}/></Show>
    <Show when={props.value.type === 'variable'}><VariablePicker document={props.document} value={props.value.type === 'variable' ? props.value.variableId : null}
      label={props.label ?? 'Значение'} types={props.valueType ? [props.valueType] : undefined} onChange={variableId => {if(variableId) props.onChange({type: 'variable', variableId});}}/></Show>
    <button type="button" class="logic-link" aria-label={`${props.label ?? 'Значение'}: ${props.value.type === 'literal' ? 'из переменной' : 'указать значение'}`}
      onClick={() => props.onChange(props.value.type === 'literal'
        ? {type: 'variable', variableId: Object.values(props.document.variables).find(variable => !props.valueType || variable.valueType === props.valueType)?.id ?? ''}
        : {type: 'literal', value: defaultLiteral(props.valueType)})}>{props.value.type === 'literal' ? 'Из переменной' : 'Указать значение'}</button>
    <Show when={props.value.type === 'literal' && !props.valueType}><details class="logic-value-options"><summary>Тип значения</summary>
      <label class="logic-field"><span>Тип значения</span><select value={literalType()} onChange={event => props.onChange({type: 'literal', value: defaultLiteral(event.currentTarget.value as ValueType)})}>
        <option value="string">Текст</option><option value="number">Число</option><option value="boolean">Да / нет</option><option value="json">JSON</option>
      </select></label></details></Show>
  </div>;
}

export function DataFields(props: {document: ShellDocument; value: Record<string, ValueSource>; onChange(value: Record<string, ValueSource>): void; label: string; columns: readonly {id: string; label: string; valueType: ValueType; readonly: boolean}[]; writable?: boolean}): JSX.Element {
  const [rows, setRows] = createSignal(Object.entries(props.value).map(([key, value]) => ({key, value})));
  const keyInputs: HTMLSelectElement[] = [];
  const columns = () => props.columns.filter(column => !props.writable || !column.readonly);
  function validKey(key: string): boolean {return columns().some(column => column.id === key);}
  function publish(next: Array<{key: string; value: ValueSource}>): void {
    for(let index = 0; index < next.length; index++) {
      const key = next[index].key;
      const duplicate = next.some((row, at) => at !== index && row.key === key);
      keyInputs[index]?.setCustomValidity(duplicate ? 'Имена полей не должны повторяться.' : validKey(key) ? '' : 'Укажите допустимое имя поля.');
    }
    if(next.every(row => validKey(row.key)) && new Set(next.map(row => row.key)).size === next.length) props.onChange(Object.fromEntries(next.map(row => [row.key, row.value])));
  }
  function write(index: number, patch: Partial<{key: string; value: ValueSource}>): void {
    const next = rows().map((row, at) => at === index ? {...row, ...patch} : row); setRows(next);
    publish(next);
  }
  return <div class="logic-key-value"><div class="logic-section-heading">{props.label}</div>
    <Index each={rows()}>{(row, index) => <div class="logic-key-value-row">
      <label class="logic-field"><span>Поле</span><select ref={element => {keyInputs[index] = element;}} value={row().key} required onChange={event => {
        const key = event.currentTarget.value;
        write(index, {key, value: {type: 'literal', value: defaultLiteral(columns().find(column => column.id === key)?.valueType)}});
      }}><For each={columns()}>{column => <option value={column.id} disabled={rows().some((row, at) => at !== index && row.key === column.id)}>{column.label}</option>}</For></select></label>
      <ValueSourceField document={props.document} value={row().value} valueType={columns().find(column => column.id === row().key)?.valueType} onChange={value => write(index, {value})}/>
      <button type="button" aria-label={`Удалить поле ${row().key || index + 1}`} onClick={() => {
        const next = rows().filter((_, at) => at !== index); setRows(next);
        publish(next);
      }}>×</button>
    </div>}</Index>
    <button type="button" class="logic-link" disabled={rows().length >= columns().length} onClick={() => {
      const column = columns().find(column => !rows().some(row => row.key === column.id));
      if(!column) return;
      const next = [...rows(), {key: column.id, value: {type: 'literal' as const, value: defaultLiteral(column.valueType)}}]; setRows(next); publish(next);
    }}>＋ Добавить поле</button>
  </div>;
}
