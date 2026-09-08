import {For, Index, Show, Switch, Match, type JSX} from 'solid-js';
import type {ActionBlock, AskBlock, CodeBlock, DecisionBlock, LocalAction, ShellDocument, Transition, WaitBlock, WaitDefinition} from '../core/types';
import {ShellLimits} from '../core/types';
import {OrdersColumns} from '../core/values';
import Bubble from '../native/Bubble';
import {DataFields, JsonInput, LiteralField, TransitionField, ValueSourceField, VariablePicker, defaultLiteral, variableType, writableVariable} from './fields';

interface EditorProps<T> {document: ShellDocument; value: T; onChange(value: T): void; newId(prefix: string): string}
const next: Transition = {type: 'continue'};
function Outcomes(props: {document: ShellDocument; success: Transition; error: Transition | null; errorLabel?: string; onChange(success: Transition, error: Transition | null): void}): JSX.Element {
  return <><TransitionField document={props.document} value={props.success} label="После выполнения" onChange={value => {if(value) props.onChange(value, props.error);}}/>
    <TransitionField document={props.document} value={props.error} allowUnset unsetLabel={props.errorLabel ?? 'Остановиться и показать ошибку'} label="Если ошибка"
      onChange={value => props.onChange(props.success, value)}/></>;
}

export function AskFields(props: EditorProps<AskBlock> & {text: string; onText(value: string): void}): JSX.Element {
  const patch = (value: Partial<AskBlock>) => props.onChange({...props.value, ...value});
  function answerType(type: AskBlock['answerType']): void {
    const compatibleType = type === 'number' ? 'number' : 'string';
    const current = props.document.variables[props.value.variableId];
    const variableId = current?.valueType === compatibleType ? current.id
      : Object.values(props.document.variables).find(variable => writableVariable(variable) && variable.valueType === compatibleType)?.id ?? '';
    patch({answerType: type, variableId, choices: type === 'choice' ? props.value.choices.length ? props.value.choices : [
      {id: props.newId('choice'), label: 'Да', value: 'Да'}, {id: props.newId('choice'), label: 'Нет', value: 'Нет'}
    ] : []});
  }
  return <div class="logic-fields logic-ask-fields">
    <Bubble class="logic-ask-question" text={props.text} editor={<span class="message-editor-frame" data-value={props.text || 'Что спросить у пользователя?'}>
      <textarea class="message-editor" aria-label="Вопрос бота" rows={1} required maxLength={ShellLimits.textCharacters} value={props.text}
        onInput={event => props.onText(event.currentTarget.value)} placeholder="Что спросить у пользователя?"/>
    </span>}/>
    <label class="logic-field"><span>Тип ответа</span><select value={props.value.answerType} onChange={event => answerType(event.currentTarget.value as AskBlock['answerType'])}>
      <option value="text">Текст</option><option value="number">Число</option><option value="choice">Выбор из вариантов</option>
    </select></label>
    <Show when={props.value.answerType === 'choice'}><div class="logic-section">
      <Index each={props.value.choices}>{(choice, index) => <div class="logic-inline-fields">
        <label class="logic-field"><span>Вариант {index + 1}</span><input required value={choice().label} onInput={event => {
          const label = event.currentTarget.value; patch({choices: props.value.choices.map((item, at) => at === index ? {...item, label, value: label} : item)});
        }}/></label><button type="button" class="logic-link" aria-label={`Удалить вариант ${index + 1}`} disabled={props.value.choices.length < 2}
          onClick={() => patch({choices: props.value.choices.filter((_, at) => at !== index)})}>Удалить</button>
      </div>}</Index>
      <button type="button" class="logic-link" disabled={props.value.choices.length >= ShellLimits.cases}
        onClick={() => patch({choices: [...props.value.choices, {id: props.newId('choice'), label: '', value: ''}]})}>＋ Вариант ответа</button>
    </div></Show>
    <details class="logic-section logic-answer-settings" open={props.value.success.type !== 'continue' || props.value.error !== null}>
      <summary>Настройки ответа</summary><div class="logic-fields">
        <VariablePicker document={props.document} value={props.value.variableId} writable types={[props.value.answerType === 'number' ? 'number' : 'string']}
          label="Сохранить ответ" onChange={variableId => {if(variableId) patch({variableId});}}/>
        <Outcomes document={props.document} success={props.value.success} error={props.value.error} errorLabel="Повторить вопрос" onChange={(success, error) => patch({success, error})}/>
      </div>
    </details>
  </div>;
}

const operatorLabels = {exists: 'Значение существует', eq: 'Равно', neq: 'Не равно', gt: 'Больше', gte: 'Больше или равно', lt: 'Меньше', lte: 'Меньше или равно', contains: 'Содержит'};
export function DecisionFields(props: EditorProps<DecisionBlock>): JSX.Element {
  type Branch = DecisionBlock['cases'][number];
  const patch = (index: number, value: Partial<Branch>) => props.onChange({...props.value, cases: props.value.cases.map((branch, at) => at === index ? {...branch, ...value} : branch)});
  return <div class="logic-fields"><Index each={props.value.cases}>{(branch, index) => <div class="logic-section" data-testid={`decision-case-${branch().id}`}>
    <div class="logic-section-heading"><span>{index === 0 ? 'Если' : 'Иначе если'}</span><Show when={props.value.cases.length > 1}><button type="button" aria-label={`Удалить условие ${index + 1}`} onClick={() => props.onChange({...props.value, cases: props.value.cases.filter((_, at) => at !== index)})}>×</button></Show></div>
    <div class="logic-condition" role="group" aria-label={`Условие ${index + 1}`}><VariablePicker document={props.document} value={branch().condition.variableId} onChange={variableId => {
      if(!variableId) return;
      patch(index, {condition: {variableId, operator: 'eq', value: {type: 'literal', value: defaultLiteral(variableType(props.document, variableId))}}});
    }}/>
    <label class="logic-field"><span>Проверка</span><select value={branch().condition.operator} onChange={event => {
      const operator = event.currentTarget.value as Branch['condition']['operator'];
      const condition = branch().condition;
      patch(index, {condition: operator === 'exists' ? {variableId: condition.variableId, operator}
        : {variableId: condition.variableId, operator, value: 'value' in condition ? condition.value : {type: 'literal', value: defaultLiteral(variableType(props.document, condition.variableId))}}});
    }}>
      <For each={(Object.keys(operatorLabels) as Array<keyof typeof operatorLabels>).filter(operator => ['eq', 'neq', 'exists'].includes(operator)
        || variableType(props.document, branch().condition.variableId) === 'number' && ['gt', 'gte', 'lt', 'lte'].includes(operator)
        || variableType(props.document, branch().condition.variableId) === 'string' && operator === 'contains')}>{operator => <option value={operator}>{operatorLabels[operator]}</option>}</For>
    </select></label>
    <Show when={branch().condition.operator !== 'exists'}><ValueSourceField document={props.document}
      value={'value' in branch().condition ? (branch().condition as Exclude<Branch['condition'], {operator: 'exists'}>).value : {type: 'literal', value: ''}}
      valueType={variableType(props.document, branch().condition.variableId)} onChange={value => {
        const condition = branch().condition; if(condition.operator !== 'exists') patch(index, {condition: {...condition, value}});
      }}/></Show></div>
    <TransitionField document={props.document} value={branch().transition} label="Тогда" onChange={value => {if(value) patch(index, {transition: value});}}/>
    <details class="logic-branch-settings"><summary>Название ветки</summary>
      <label class="logic-field"><span>Название ветки</span><input required value={branch().label}
        onInvalid={event => {const details = event.currentTarget.closest('details'); if(details) details.open = true;}}
        onInput={event => patch(index, {label: event.currentTarget.value})}/></label>
    </details>
  </div>}</Index>
    <button type="button" class="logic-link" disabled={props.value.cases.length >= ShellLimits.cases} onClick={() => props.onChange({...props.value, cases: [...props.value.cases,
      {id: props.newId('case'), label: `Ветка ${props.value.cases.length + 1}`, condition: {variableId: 'user.balance', operator: 'gte', value: {type: 'literal', value: 1000}}, transition: next}]})}>＋ Ещё условие</button>
    <TransitionField document={props.document} value={props.value.otherwise} label="Иначе" onChange={otherwise => {if(otherwise) props.onChange({...props.value, otherwise});}}/>
  </div>;
}

const actions: Array<{value: LocalAction['type']; label: string}> = [
  {value: 'set', label: 'Записать значение'}, {value: 'increment', label: 'Увеличить или уменьшить число'},
  {value: 'table_create', label: 'Создать запись'}, {value: 'table_find', label: 'Найти записи'}, {value: 'table_update', label: 'Обновить записи'}, {value: 'http_mock', label: 'HTTP · имитация'}
];
function actionDraft(type: LocalAction['type']): LocalAction {
  switch(type) {
    case 'set': return {type, variableId: 'run.answer', value: {type: 'literal', value: ''}};
    case 'increment': return {type, variableId: 'user.balance', amount: -1000};
    case 'table_create': return {type, table: 'orders', values: {product: {type: 'literal', value: 'Материал'}}, resultVariableId: 'run.result'};
    case 'table_find': return {type, table: 'orders', where: {status: {type: 'literal', value: 'new'}}, resultVariableId: 'run.result'};
    case 'table_update': return {type, table: 'orders', where: {status: {type: 'literal', value: 'new'}}, values: {status: {type: 'literal', value: 'done'}}, resultVariableId: 'run.result'};
    case 'http_mock': return {type, method: 'POST', url: 'https://example.com/webhook', headers: {}, body: {}, attempts: 3,
      fixture: {status: 200, body: {ok: true}, failuresBeforeSuccess: 0}, resultVariableId: 'run.http'};
  }
}
export function ActionFields(props: EditorProps<ActionBlock>): JSX.Element {
  const change = (action: LocalAction) => props.onChange({...props.value, action});
  const action = () => props.value.action;
  return <div class="logic-fields"><label class="logic-field"><span>Действие</span><select value={action().type} onChange={event => change(actionDraft(event.currentTarget.value as LocalAction['type']))}>
    <For each={actions}>{item => <option value={item.value}>{item.label}</option>}</For>
  </select></label><Switch>
    <Match when={action().type === 'set'}><VariablePicker document={props.document} value={(action() as Extract<LocalAction, {type: 'set'}>).variableId} writable
      onChange={variableId => {if(variableId) change({type: 'set', variableId, value: {type: 'literal', value: defaultLiteral(variableType(props.document, variableId))}});}}/>
      <ValueSourceField document={props.document} value={(action() as Extract<LocalAction, {type: 'set'}>).value}
        valueType={variableType(props.document, (action() as Extract<LocalAction, {type: 'set'}>).variableId)} onChange={value => {const old = action(); if(old.type === 'set') change({...old, value});}}/>
    </Match>
    <Match when={action().type === 'increment'}><VariablePicker document={props.document} value={(action() as Extract<LocalAction, {type: 'increment'}>).variableId} writable types={['number']}
      onChange={variableId => {const old = action(); if(variableId && old.type === 'increment') change({...old, variableId});}}/>
      <LiteralField value={(action() as Extract<LocalAction, {type: 'increment'}>).amount} valueType="number" label="На сколько · отрицательное число уменьшает"
        onChange={amount => {const old = action(); if(typeof amount === 'number' && old.type === 'increment') change({...old, amount});}}/>
    </Match>
    <Match when={action().type.startsWith('table_')}><Show when={action().type} keyed>{type => <div class="logic-fields" data-action-type={type}>
      <p class="logic-note">Таблица orders · данные только внутри теста</p>
      <Show when={'where' in action()}><DataFields document={props.document} columns={OrdersColumns} label="Какие записи найти"
        value={(action() as Extract<LocalAction, {where: unknown}>).where} onChange={where => {const old = action(); if('where' in old) change({...old, where});}}/></Show>
      <Show when={'values' in action()}><DataFields document={props.document} columns={OrdersColumns} writable label="Поля записи"
        value={(action() as Extract<LocalAction, {values: unknown}>).values} onChange={values => {const old = action(); if('values' in old) change({...old, values});}}/></Show>
      <VariablePicker document={props.document} value={(action() as Extract<LocalAction, {resultVariableId: unknown}>).resultVariableId} writable types={['json']}
        allowEmpty={action().type !== 'table_find'} label="Сохранить результат" onChange={resultVariableId => {
          const old = action(); if(old.type === 'table_find' && resultVariableId) change({...old, resultVariableId});
          else if(old.type === 'table_create' || old.type === 'table_update') change({...old, resultVariableId});
        }}/>
    </div>}</Show></Match>
    <Match when={action().type === 'http_mock'}><HttpFields document={props.document} value={action() as Extract<LocalAction, {type: 'http_mock'}>} onChange={change}/></Match>
  </Switch><TransitionField document={props.document} value={props.value.success} label="После выполнения" onChange={success => {if(success) props.onChange({...props.value, success});}}/>
    <details class="logic-section logic-error-settings" open={props.value.error !== null}><summary>Если ошибка</summary>
      <TransitionField document={props.document} value={props.value.error} allowUnset unsetLabel="Остановиться и показать ошибку" label="Если ошибка"
        onChange={error => props.onChange({...props.value, error})}/>
    </details>
  </div>;
}

function HttpFields(props: {document: ShellDocument; value: Extract<LocalAction, {type: 'http_mock'}>; onChange(value: Extract<LocalAction, {type: 'http_mock'}>): void}): JSX.Element {
  const patch = (value: Partial<typeof props.value>) => props.onChange({...props.value, ...value});
  return <>
    <p class="logic-note">Локальная имитация. Запрос по адресу не отправляется.</p>
    <div class="logic-inline-fields"><label class="logic-field"><span>Метод</span><select value={props.value.method} onChange={event => patch({method: event.currentTarget.value as typeof props.value.method})}>
      <For each={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}>{method => <option>{method}</option>}</For>
    </select></label><label class="logic-field"><span>Адрес</span><input required value={props.value.url} onInput={event => patch({url: event.currentTarget.value})}/></label></div>
    <details class="logic-section"><summary>Запрос: заголовки и тело</summary><div class="logic-fields">
      <label class="logic-field"><span>Заголовки · JSON</span><JsonInput value={props.value.headers} objectOnly validate={value => value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(item => typeof item === 'string') ? null : 'Значения заголовков должны быть строками.'} onChange={value => {
        if(value && typeof value === 'object' && !Array.isArray(value)) patch({headers: value as Record<string, string>});
      }}/></label><label class="logic-field"><span>Тело запроса · JSON</span><JsonInput value={props.value.body} onChange={body => patch({body})}/></label>
    </div></details>
    <div class="logic-section"><div class="logic-section-heading">Ответ для теста</div><div class="logic-inline-fields">
      <label class="logic-field"><span>HTTP-статус</span><input type="number" required min="100" max="599" step="1" value={props.value.fixture.status} onInput={event => {
        if(event.currentTarget.validity.valid) patch({fixture: {...props.value.fixture, status: event.currentTarget.valueAsNumber}});
      }}/></label><label class="logic-field"><span>Сбоев перед успехом</span><input type="number" required min="0" max={ShellLimits.httpAttempts} step="1" value={props.value.fixture.failuresBeforeSuccess} onInput={event => {
        if(event.currentTarget.validity.valid) patch({fixture: {...props.value.fixture, failuresBeforeSuccess: event.currentTarget.valueAsNumber}});
      }}/></label></div>
      <label class="logic-field"><span>Тело ответа · JSON</span><JsonInput value={props.value.fixture.body} onChange={body => patch({fixture: {...props.value.fixture, body}})}/></label>
      <label class="logic-field"><span>Максимум попыток</span><input type="number" required min="1" max={ShellLimits.httpAttempts} step="1" value={props.value.attempts} onInput={event => {
        if(event.currentTarget.validity.valid) patch({attempts: event.currentTarget.valueAsNumber});
      }}/></label>
    </div>
    <VariablePicker document={props.document} value={props.value.resultVariableId} writable types={['json']} allowEmpty label="Сохранить ответ" onChange={resultVariableId => patch({resultVariableId})}/>
  </>;
}

const durationUnits = {seconds: {label: 'Секунды', factor: 1000}, minutes: {label: 'Минуты', factor: 60000}, hours: {label: 'Часы', factor: 3600000}, days: {label: 'Дни', factor: 86400000}};
function localDate(at: number): string {
  const value = new Date(at - new Date(at).getTimezoneOffset() * 60000); return value.toISOString().slice(0, 16);
}
export function WaitFields(props: EditorProps<WaitBlock>): JSX.Element {
  const patch = (value: Partial<WaitBlock>) => props.onChange({...props.value, ...value});
  const wait = () => props.value.wait;
  function typeChange(type: WaitDefinition['type']): void {
    patch({wait: type === 'duration' ? {type, milliseconds: 3 * 86400000, unit: 'days'}
      : type === 'date' ? {type, at: Date.UTC(2026, 11, 31, 12)}
      : type === 'event' ? {type, name: 'payment.completed'} : {type, mode: 'any', variableId: null},
      timeout: type === 'event' || type === 'input' ? props.value.timeout : null});
  }
  return <div class="logic-fields"><label class="logic-field"><span>Когда продолжить</span><select value={wait().type} onChange={event => typeChange(event.currentTarget.value as WaitDefinition['type'])}>
    <option value="duration">Через время</option><option value="date">В указанную дату</option><option value="event">После события</option><option value="input">После сообщения</option>
  </select></label><Switch>
    <Match when={wait().type === 'duration'}><div class="logic-inline-fields"><label class="logic-field"><span>Длительность</span><input type="number" min="0.001" step="any" required
      value={(wait() as Extract<WaitDefinition, {type: 'duration'}>).milliseconds / durationUnits[(wait() as Extract<WaitDefinition, {type: 'duration'}>).unit].factor}
      onInput={event => {const old = wait(); if(old.type === 'duration' && event.currentTarget.validity.valid) patch({wait: {...old, milliseconds: Math.round(event.currentTarget.valueAsNumber * durationUnits[old.unit].factor)}});}}/></label>
      <label class="logic-field"><span>Единица</span><select value={(wait() as Extract<WaitDefinition, {type: 'duration'}>).unit} onChange={event => {
        const old = wait(), unit = event.currentTarget.value as keyof typeof durationUnits;
        if(old.type === 'duration') patch({wait: {...old, unit, milliseconds: Math.round(old.milliseconds / durationUnits[old.unit].factor * durationUnits[unit].factor)}});
      }}><For each={Object.entries(durationUnits)}>{([id, unit]) => <option value={id}>{unit.label}</option>}</For></select></label></div></Match>
    <Match when={wait().type === 'date'}><label class="logic-field"><span>Дата и время · часовой пояс устройства</span><input type="datetime-local" required
      value={localDate((wait() as Extract<WaitDefinition, {type: 'date'}>).at)} onInput={event => {const at = new Date(event.currentTarget.value).getTime(); if(Number.isFinite(at)) patch({wait: {type: 'date', at}});}}/></label></Match>
    <Match when={wait().type === 'event'}><label class="logic-field"><span>Имя события</span><input required value={(wait() as Extract<WaitDefinition, {type: 'event'}>).name}
      placeholder="payment.completed" onInput={event => patch({wait: {type: 'event', name: event.currentTarget.value}})}/></label></Match>
    <Match when={wait().type === 'input'}><label class="logic-field"><span>Какое сообщение</span><select value={(wait() as Extract<WaitDefinition, {type: 'input'}>).mode} onChange={event => {
      const old = wait(); if(old.type === 'input') patch({wait: {...old, mode: event.currentTarget.value as typeof old.mode}});
    }}><option value="any">Любое</option><option value="text">Обычный текст</option><option value="command">Команда</option></select></label>
      <VariablePicker document={props.document} value={(wait() as Extract<WaitDefinition, {type: 'input'}>).variableId} writable types={['string']} allowEmpty label="Сохранить сообщение"
        onChange={variableId => {const old = wait(); if(old.type === 'input') patch({wait: {...old, variableId}});}}/>
    </Match>
  </Switch><TransitionField document={props.document} value={props.value.success} label="После ожидания" onChange={success => {if(success) patch({success});}}/>
    <Show when={wait().type === 'event' || wait().type === 'input'}><details class="logic-section logic-timeout-settings" open={!!props.value.timeout}><summary>Время ожидания</summary>
    <label class="logic-toggle"><input type="checkbox" checked={!!props.value.timeout} onChange={event => patch({timeout: event.currentTarget.checked ? {milliseconds: 3600000, transition: {type: 'end'}} : null})}/>Ограничить время ожидания</label>
    <Show when={props.value.timeout}><div class="logic-section"><label class="logic-field"><span>Прервать через · минуты</span><input type="number" min="0.001" step="any" required value={(props.value.timeout?.milliseconds ?? 0) / 60000}
      onInvalid={event => {const details = event.currentTarget.closest('details'); if(details) details.open = true;}}
      onInput={event => {if(props.value.timeout && event.currentTarget.validity.valid) patch({timeout: {...props.value.timeout, milliseconds: Math.round(event.currentTarget.valueAsNumber * 60000)}});}}/></label>
      <TransitionField document={props.document} value={props.value.timeout?.transition ?? next} label="Если время вышло" onChange={transition => {if(transition && props.value.timeout) patch({timeout: {...props.value.timeout, transition}});}}/>
    </div></Show></details></Show>
  </div>;
}

export function CodeFields(props: EditorProps<CodeBlock> & {onOpenCode(block: CodeBlock, onSourceChange: (source: string) => void): void}): JSX.Element {
  const patch = (value: Partial<CodeBlock>) => props.onChange({...props.value, ...value});
  return <div class="logic-fields"><label class="logic-field"><span>Название</span><input required value={props.value.name} onInput={event => patch({name: event.currentTarget.value})}/></label>
    <button type="button" class="logic-code-open" onClick={() => props.onOpenCode(structuredClone(props.value), source => patch({source}))}><span>Открыть редактор кода</span><span aria-hidden="true">↗</span></button>
    <div class="logic-section"><div class="logic-section-heading">Выходы кода</div><Index each={props.value.outcomes}>{(outcome, index) => <div class="logic-section">
      <div class="logic-section-heading"><span>Выход {index + 1}</span><Show when={props.value.outcomes.length > 1}><button type="button" aria-label={`Удалить выход ${index + 1}`}
        onClick={() => patch({outcomes: props.value.outcomes.filter((_, at) => at !== index)})}>×</button></Show></div>
      <label class="logic-field"><span>Имя в коде</span><input required pattern="[A-Za-z_][A-Za-z0-9_]*" value={outcome().name} onInput={event => patch({outcomes: props.value.outcomes.map((item, at) => at === index ? {...item, name: event.currentTarget.value} : item)})}/></label>
      <TransitionField document={props.document} value={outcome().transition} onChange={transition => {if(transition) patch({outcomes: props.value.outcomes.map((item, at) => at === index ? {...item, transition} : item)});}}/>
    </div>}</Index><button type="button" class="logic-link" disabled={props.value.outcomes.length >= ShellLimits.outcomes}
      onClick={() => patch({outcomes: [...props.value.outcomes, {id: props.newId('outcome'), name: `outcome_${props.value.outcomes.length + 1}`, transition: next}]})}>＋ Выход</button></div>
    <VariablePicker document={props.document} value={props.value.resultVariableId} writable types={['json']} allowEmpty label="Сохранить результат" onChange={resultVariableId => patch({resultVariableId})}/>
  </div>;
}
