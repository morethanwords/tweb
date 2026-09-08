import {ShellLimits, type Block, type Condition, type LocalAction, type ShellDocument, type Transition, type ValueSource} from './types';
import {array, fields, object, string, validId, fail} from './validation';
import {OrdersColumns, validateJson, validateSource, sourceMatches, variable, valueMatches} from './values';

type Context = Pick<ShellDocument, 'steps' | 'variables' | 'messages'>;
export function validateTransition(value: unknown, document: Pick<ShellDocument, 'steps'>, nullable = false): Transition | null {
  if(nullable && value === null) return null;
  const raw = object(value, 'transition');
  if(raw.type === 'screen') {
    const source = fields(raw, ['type', 'screenId'], 'transition'); validId(source.screenId, 'transition.screenId');
    if(!Object.hasOwn(document.steps, source.screenId)) fail('transition.screenId', 'целевой экран отсутствует');
    return {type: 'screen', screenId: source.screenId};
  }
  fields(raw, ['type'], 'transition');
  if(raw.type !== 'continue' && raw.type !== 'end') fail('transition.type', 'неизвестный переход');
  return {type: raw.type};
}
function transition(value: unknown, document: Context): Transition {return validateTransition(value, document)!;}
function positiveTime(value: unknown, path: string, zero = false): number {
  if(!Number.isSafeInteger(value) || (value as number) < (zero ? 0 : 1)) fail(path, 'нужно положительное целое время');
  return value as number;
}
function resultVariable(value: unknown, document: Context, nullable = true): string | null {
  if(nullable && value === null) return null;
  const definition = variable(document, value, true);
  if(definition.valueType !== 'json') fail('resultVariableId', 'результат требует JSON-переменную');
  return definition.id;
}
function sourceMap(value: unknown, document: Context, writable = false): Record<string, ValueSource> {
  const raw = object(value, 'fields'); const result: Record<string, ValueSource> = {};
  if(Object.keys(raw).length > 30) fail('fields', 'максимум 30 полей');
  for(const id of Object.keys(raw)) {
    const column = OrdersColumns.find(column => column.id === id);
    if(!column || writable && column.readonly) fail('column', 'неизвестное или недоступное для записи поле orders');
    const source = validateSource(raw[id], document);
    if(!sourceMatches(source, column.valueType, document)) fail('column', 'тип значения не совпадает с полем orders');
    result[id] = source;
  }
  return result;
}
function condition(value: unknown, document: Context): Condition {
  const raw = object(value, 'condition'); const definition = variable(document, raw.variableId);
  if(raw.operator === 'exists') {fields(raw, ['variableId', 'operator'], 'condition'); return {variableId: definition.id, operator: 'exists'};}
  fields(raw, ['variableId', 'operator', 'value'], 'condition');
  if(!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'].includes(raw.operator as string)) fail('condition.operator', 'неизвестное сравнение');
  const source = validateSource(raw.value, document);
  if(!sourceMatches(source, definition.valueType, document)) fail('condition.value', 'типы сравнения не совпадают');
  if(['gt', 'gte', 'lt', 'lte'].includes(raw.operator as string) && definition.valueType !== 'number') fail('condition', 'порядковое сравнение требует числа');
  if(raw.operator === 'contains' && definition.valueType !== 'string') fail('condition', 'содержит применяется к строке');
  return {variableId: definition.id, operator: raw.operator as Exclude<Condition['operator'], 'exists'>, value: source};
}
function localAction(value: unknown, document: Context): LocalAction {
  const raw = object(value, 'action');
  if(raw.type === 'set') {
    fields(raw, ['type', 'variableId', 'value'], 'action'); const definition = variable(document, raw.variableId, true); const source = validateSource(raw.value, document);
    if(!sourceMatches(source, definition.valueType, document)) fail('action.value', 'тип значения не совпадает с переменной');
    return {type: 'set', variableId: definition.id, value: source};
  }
  if(raw.type === 'increment') {
    fields(raw, ['type', 'variableId', 'amount'], 'action'); const definition = variable(document, raw.variableId, true);
    if(definition.valueType !== 'number' || typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) fail('action', 'изменение требует числовую переменную и конечное число');
    return {type: 'increment', variableId: definition.id, amount: raw.amount};
  }
  if(raw.type === 'http_mock') {
    fields(raw, ['type', 'method', 'url', 'headers', 'body', 'attempts', 'fixture', 'resultVariableId'], 'action');
    if(!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(raw.method as string)) fail('action.method', 'неизвестный метод');
    const url = string(raw.url, 'action.url'); if(url && !/^https?:\/\//i.test(url)) fail('action.url', 'нужен адрес HTTP(S)');
    const headers = object(raw.headers, 'action.headers'); const checked: Record<string, string> = {};
    for(const key of Object.keys(headers)) {if(!/^[A-Za-z0-9-]+$/.test(key)) fail('action.headers', 'некорректное имя заголовка'); checked[key] = string(headers[key], 'header');}
    if(!Number.isInteger(raw.attempts) || (raw.attempts as number) < 1 || (raw.attempts as number) > ShellLimits.httpAttempts) fail('action.attempts', 'нужно от 1 до 20 попыток');
    const fixture = fields(raw.fixture, ['status', 'body', 'failuresBeforeSuccess'], 'action.fixture');
    if(!Number.isInteger(fixture.status) || (fixture.status as number) < 100 || (fixture.status as number) > 599) fail('fixture.status', 'нужен HTTP-код');
    if(!Number.isInteger(fixture.failuresBeforeSuccess) || (fixture.failuresBeforeSuccess as number) < 0 || (fixture.failuresBeforeSuccess as number) > ShellLimits.httpAttempts) fail('fixture.failuresBeforeSuccess', 'нужно число от 0 до 20');
    return {type: 'http_mock', method: raw.method as 'GET', url, headers: checked, body: validateJson(raw.body), attempts: raw.attempts as number,
      fixture: {status: fixture.status as number, body: validateJson(fixture.body), failuresBeforeSuccess: fixture.failuresBeforeSuccess as number}, resultVariableId: resultVariable(raw.resultVariableId, document)};
  }
  if(!['table_create', 'table_find', 'table_update'].includes(raw.type as string)) fail('action.type', 'неизвестное локальное действие');
  const type = raw.type as 'table_create' | 'table_find' | 'table_update';
  fields(raw, ['type', 'table', 'resultVariableId', ...(type === 'table_create' ? ['values'] : type === 'table_find' ? ['where'] : ['where', 'values'])], 'action');
  if(raw.table !== 'orders') fail('action.table', 'доступна локальная таблица orders');
  const output = resultVariable(raw.resultVariableId, document, type !== 'table_find');
  if(type === 'table_create') return {type, table: 'orders', values: sourceMap(raw.values, document, true), resultVariableId: output};
  if(type === 'table_find') return {type, table: 'orders', where: sourceMap(raw.where, document), resultVariableId: output!};
  return {type, table: 'orders', where: sourceMap(raw.where, document), values: sourceMap(raw.values, document, true), resultVariableId: output};
}

export function validateBlock(value: unknown, id: string, document: Context): Block {
  validId(id, 'blockId'); const raw = object(value, `blocks.${id}`);
  if(raw.id !== id) fail(`blocks.${id}.id`, 'идентификатор не совпадает с ключом');
  if(raw.type === 'message' || raw.type === 'ask') {
    fields(raw, raw.type === 'message' ? ['id', 'type', 'messageId'] : ['id', 'type', 'messageId', 'variableId', 'answerType', 'choices', 'success', 'error'], `blocks.${id}`);
    validId(raw.messageId, `blocks.${id}.messageId`);
    if(!Object.hasOwn(document.messages, raw.messageId)) fail(`blocks.${id}.messageId`, 'сообщение отсутствует');
    if(raw.type === 'message') return {id, type: 'message', messageId: raw.messageId};
    const definition = variable(document, raw.variableId, true);
    if(!['text', 'number', 'choice'].includes(raw.answerType as string)) fail('answerType', 'неизвестный тип ответа');
    if(raw.answerType === 'text' && definition.valueType !== 'string' || raw.answerType === 'number' && definition.valueType !== 'number') fail('answerType', 'тип ответа не совпадает с переменной');
    const used = new Set<string>();
    const choices = array(raw.choices, 'choices', ShellLimits.cases).map(choice => {
      const option = fields(choice, ['id', 'label', 'value'], 'choice'); validId(option.id, 'choice.id');
      if(used.has(option.id)) fail('choice.id', 'повтор варианта'); used.add(option.id);
      const selected = validateJson(option.value);
      if(!valueMatches(selected, definition.valueType)) fail('choice.value', 'тип варианта не совпадает с переменной');
      return {id: option.id, label: string(option.label, 'choice.label'), value: selected};
    });
    if(raw.answerType === 'choice' ? !choices.length : choices.length > 0) fail('choices', 'варианты нужны только для ответа выбором');
    return {id, type: 'ask', messageId: raw.messageId, variableId: definition.id, answerType: raw.answerType as 'text', choices, success: transition(raw.success, document), error: validateTransition(raw.error, document, true)};
  }
  if(raw.type === 'decision') {
    fields(raw, ['id', 'type', 'cases', 'otherwise'], 'decision'); const used = new Set<string>();
    const cases = array(raw.cases, 'cases', ShellLimits.cases).map(item => {
      const entry = fields(item, ['id', 'label', 'condition', 'transition'], 'case'); validId(entry.id, 'case.id');
      if(used.has(entry.id)) fail('case.id', 'повтор условия'); used.add(entry.id);
      return {id: entry.id, label: string(entry.label, 'case.label'), condition: condition(entry.condition, document), transition: transition(entry.transition, document)};
    });
    return {id, type: 'decision', cases, otherwise: transition(raw.otherwise, document)};
  }
  if(raw.type === 'action') {
    fields(raw, ['id', 'type', 'action', 'success', 'error'], 'actionBlock');
    return {id, type: 'action', action: localAction(raw.action, document), success: transition(raw.success, document), error: validateTransition(raw.error, document, true)};
  }
  if(raw.type === 'wait') {
    fields(raw, ['id', 'type', 'wait', 'success', 'timeout'], 'waitBlock'); const wait = object(raw.wait, 'wait'); let result: Extract<Block, {type: 'wait'}>['wait'];
    if(wait.type === 'duration') {
      fields(wait, ['type', 'milliseconds', 'unit'], 'wait');
      if(!['seconds', 'minutes', 'hours', 'days'].includes(wait.unit as string)) fail('wait.unit', 'неизвестная единица');
      result = {type: 'duration', milliseconds: positiveTime(wait.milliseconds, 'wait.milliseconds'), unit: wait.unit as 'seconds'};
    } else if(wait.type === 'date') {
      fields(wait, ['type', 'at'], 'wait'); const at = positiveTime(wait.at, 'wait.at', true);
      if(!Number.isFinite(new Date(at).getTime())) fail('wait.at', 'дата выходит за допустимые границы');
      result = {type: 'date', at};
    }
    else if(wait.type === 'event') {fields(wait, ['type', 'name'], 'wait'); const name = string(wait.name, 'wait.name'); if(!name.trim()) fail('wait.name', 'задайте имя события'); result = {type: 'event', name};}
    else {
      fields(wait, ['type', 'mode', 'variableId'], 'wait'); if(wait.type !== 'input' || !['any', 'text', 'command'].includes(wait.mode as string)) fail('wait', 'неизвестное ожидание');
      result = {type: 'input', mode: wait.mode as 'any', variableId: wait.variableId === null ? null : variable(document, wait.variableId, true).id};
    }
    let timeout: Extract<Block, {type: 'wait'}>['timeout'] = null;
    if(raw.timeout !== null && (result.type === 'duration' || result.type === 'date')) fail('timeout', 'дополнительный тайм-аут доступен для события или ввода');
    if(raw.timeout !== null) {const source = fields(raw.timeout, ['milliseconds', 'transition'], 'timeout'); timeout = {milliseconds: positiveTime(source.milliseconds, 'timeout.milliseconds'), transition: transition(source.transition, document)};}
    return {id, type: 'wait', wait: result, success: transition(raw.success, document), timeout};
  }
  if(raw.type === 'code') {
    fields(raw, ['id', 'type', 'name', 'source', 'outcomes', 'resultVariableId'], 'codeBlock');
    const source = string(raw.source, 'code.source'); if(new TextEncoder().encode(source).byteLength > ShellLimits.codeBytes) fail('code.source', 'максимум 32 KiB исходного кода');
    const names = new Set<string>(), ids = new Set<string>();
    const outcomes = array(raw.outcomes, 'outcomes', ShellLimits.outcomes).map(item => {
      const outcome = fields(item, ['id', 'name', 'transition'], 'outcome'); validId(outcome.id, 'outcome.id');
      const name = string(outcome.name, 'outcome.name'); if(!name.trim() || names.has(name) || ids.has(outcome.id)) fail('outcome', 'нужны уникальные имена и идентификаторы');
      names.add(name); ids.add(outcome.id); return {id: outcome.id, name, transition: transition(outcome.transition, document)};
    });
    if(!outcomes.length) fail('outcomes', 'нужен хотя бы один исход');
    return {id, type: 'code', name: string(raw.name, 'code.name'), source, outcomes, resultVariableId: resultVariable(raw.resultVariableId, document)};
  }
  fail(`blocks.${id}.type`, 'неизвестный тип блока');
}

/** Labeled exits are the one source for reference checks and graph presentation. */
export function blockTransitionEntries(block: Block): {label: string; transition: Transition}[] {
  switch(block.type) {
    case 'message': return [];
    case 'ask': return [{label: 'Вопрос: ответ принят', transition: block.success}, ...(block.error ? [{label: 'Вопрос: ошибка', transition: block.error}] : [])];
    case 'action': return [{label: 'Действие: успех', transition: block.success}, ...(block.error ? [{label: 'Действие: ошибка', transition: block.error}] : [])];
    case 'decision': return [...block.cases.map(item => ({label: `Условие: ${item.label.trim() || 'Без названия'}`, transition: item.transition})), {label: 'Условие: иначе', transition: block.otherwise}];
    case 'wait': return [{label: 'Ожидание: завершено', transition: block.success}, ...(block.timeout ? [{label: 'Ожидание: тайм-аут', transition: block.timeout.transition}] : [])];
    case 'code': return block.outcomes.map(item => ({label: `${block.name.trim() || 'Код'}: ${item.name}`, transition: item.transition}));
  }
}

export function blockTransitions(block: Block): Transition[] {return blockTransitionEntries(block).map(item => item.transition);}
