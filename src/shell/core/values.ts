import {ShellLimits, type CodeContext, type Condition, type JsonValue, type ShellDocument, type TestRun, type TestSeed, type ValueSource, type ValueType, type VariableDefinition, type VariableScope} from './types';
import {array, fields, object, string, fail} from './validation';

const scopes: VariableScope[] = ['user', 'conversation', 'run', 'bot', 'event', 'system'];
export const VariableCatalog: Record<string, VariableDefinition> = Object.fromEntries([
  ['user.name', 'Имя', 'string'], ['user.age', 'Возраст', 'number'], ['user.balance', 'Баланс', 'number'],
  ['user.plan', 'Тариф', 'string'], ['user.subscribed', 'Подписан', 'boolean'], ['user.telegramId', 'Telegram ID', 'string'],
  ['run.answer', 'Ответ', 'string'], ['run.count', 'Счётчик', 'number'], ['run.result', 'Результат', 'json'],
  ['run.http', 'HTTP-результат', 'json'], ['run.payment', 'Платёж в тесте', 'json'], ['run.productPrice', 'Цена', 'number'],
  ['conversation.id', 'Диалог', 'string'], ['conversation.lastInput', 'Последнее сообщение', 'string'],
  ['bot.name', 'Имя бота', 'string'], ['event.name', 'Событие', 'string'], ['event.data', 'Данные события', 'json'], ['system.now', 'Время теста', 'number']
].map(([id, label, valueType]) => [id, {id, label, scope: id.split('.')[0] as VariableScope, valueType: valueType as ValueType}]));

export function validateJson(value: unknown, path = 'value', maximum = ShellLimits.codeValueBytes): JsonValue {
  let nodes = 0;
  function walk(input: unknown, depth: number): JsonValue {
    if(++nodes > maximum || depth > 30) fail(path, 'слишком сложное JSON-значение');
    if(input === null || typeof input === 'boolean') return input;
    if(typeof input === 'number') {if(!Number.isFinite(input)) fail(path, 'нужно конечное число'); return input;}
    if(typeof input === 'string') {if(input.length > maximum) fail(path, 'превышен размер JSON'); return input;}
    if(Array.isArray(input)) return array(input, path, maximum).map(item => walk(item, depth + 1));
    const source = object(input, path); const output: Record<string, JsonValue> = {};
    for(const key of Object.keys(source).sort()) {
      if(['__proto__', 'constructor', 'prototype'].includes(key)) fail(path, 'небезопасный ключ JSON');
      output[key] = walk(source[key], depth + 1);
    }
    return output;
  }
  const result = walk(value, 0);
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength > maximum) fail(path, `JSON превышает ${maximum} байт`);
  return result;
}

export function validateVariable(value: unknown, id: string): VariableDefinition {
  const source = fields(value, ['id', 'label', 'scope', 'valueType'], `variables.${id}`);
  if(source.id !== id || !/^(user|conversation|run|bot|event|system)\.[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id)) fail(`variables.${id}`, 'нужен уникальный путь scope.name');
  if(['constructor', 'prototype', '__proto__'].includes(id.split('.')[1])) fail(`variables.${id}`, 'небезопасное имя переменной');
  if(source.scope !== id.split('.')[0]) fail(`variables.${id}.scope`, 'область не соответствует пути');
  if(!['number', 'string', 'boolean', 'json'].includes(source.valueType as string)) fail(`variables.${id}.valueType`, 'неизвестный тип');
  return {id, label: string(source.label, `variables.${id}.label`), scope: source.scope as VariableScope, valueType: source.valueType as ValueType};
}

export function variable(document: Pick<ShellDocument, 'variables'>, id: unknown, writable = false): VariableDefinition {
  if(typeof id !== 'string' || !Object.hasOwn(document.variables, id)) throw new Error(`Переменная ${String(id)} отсутствует.`);
  const definition = document.variables[id];
  if(writable && (definition.scope === 'event' || definition.scope === 'system')) throw new Error('Переменная доступна только для чтения.');
  return definition;
}

export function valueMatches(value: JsonValue, type: ValueType): boolean {
  return type === 'json' || typeof value === type;
}

export function validateSource(value: unknown, document: Pick<ShellDocument, 'variables'>): ValueSource {
  const raw = object(value, 'value');
  if(raw.type === 'literal') {const source = fields(raw, ['type', 'value'], 'value'); return {type: 'literal', value: validateJson(source.value)};}
  const source = fields(raw, ['type', 'variableId'], 'value');
  if(source.type !== 'variable') fail('value.type', 'ожидается literal или variable');
  return {type: 'variable', variableId: variable(document, source.variableId).id};
}

export function sourceMatches(source: ValueSource, type: ValueType, document: Pick<ShellDocument, 'variables'>): boolean {
  return type === 'json' || (source.type === 'literal' ? valueMatches(source.value, type) : variable(document, source.variableId).valueType === type);
}

export function resolveValue(values: Record<string, JsonValue>, source: ValueSource): JsonValue {
  if(source.type === 'literal') return structuredClone(source.value);
  if(!Object.hasOwn(values, source.variableId)) throw new Error(`Нет значения переменной ${source.variableId}.`);
  return structuredClone(values[source.variableId]);
}

export function conditionMatches(values: Record<string, JsonValue>, condition: Condition): boolean {
  const present = Object.hasOwn(values, condition.variableId) && values[condition.variableId] !== null;
  if(condition.operator === 'exists') return present;
  if(!present) return false;
  const left = values[condition.variableId], right = resolveValue(values, condition.value);
  switch(condition.operator) {
    case 'eq': return JSON.stringify(left) === JSON.stringify(right);
    case 'neq': return JSON.stringify(left) !== JSON.stringify(right);
    case 'gt': return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'gte': return typeof left === 'number' && typeof right === 'number' && left >= right;
    case 'lt': return typeof left === 'number' && typeof right === 'number' && left < right;
    case 'lte': return typeof left === 'number' && typeof right === 'number' && left <= right;
    case 'contains': return typeof left === 'string' && typeof right === 'string' && left.includes(right);
  }
}

export function defaultTestSeed(document: ShellDocument): TestSeed {
  const suggested: Record<string, JsonValue> = {'user.name': 'Тестовый гость', 'user.age': 25, 'user.balance': 1500, 'user.plan': 'free', 'user.subscribed': false, 'user.telegramId': 'local-user', 'run.productPrice': 500, 'conversation.id': 'local-conversation', 'bot.name': document.bot.title};
  const variables: Record<string, JsonValue> = {};
  for(const definition of Object.values(document.variables)) variables[definition.id] = Object.hasOwn(suggested, definition.id) ? suggested[definition.id] : definition.valueType === 'number' ? 0 : definition.valueType === 'boolean' ? false : definition.valueType === 'string' ? '' : null;
  return {variables, tables: {orders: []}};
}

export function validateTestSeed(document: ShellDocument, input: TestSeed): TestSeed {
  const raw = fields(input, ['variables', 'tables'], 'testSeed');
  const supplied = object(raw.variables, 'testSeed.variables'); const defaults = defaultTestSeed(document);
  for(const id of Object.keys(supplied)) {
    const definition = variable(document, id); const value = validateJson(supplied[id], `testSeed.variables.${id}`);
    if(!valueMatches(value, definition.valueType)) fail(id, 'значение не соответствует типу переменной');
    defaults.variables[id] = value;
  }
  const tables = fields(raw.tables, ['orders'], 'testSeed.tables');
  const rowIds = new Set<string>();
  defaults.tables.orders = array(tables.orders, 'testSeed.tables.orders', 500).map((row, index) => {
    const source = object(row, `orders[${index}]`);
    for(const [id, value] of Object.entries(source)) {
      const column = OrdersColumns.find(column => column.id === id);
      if(!column || typeof value !== column.valueType) fail(`orders[${index}].${id}`, 'поле не соответствует каталогу orders');
    }
    if(typeof source.id !== 'string' || !source.id.trim() || rowIds.has(source.id)) fail(`orders[${index}].id`, 'нужен уникальный ID строки');
    if(!Number.isSafeInteger(source.createdAt) || (source.createdAt as number) < 0) fail(`orders[${index}].createdAt`, 'нужна дата создания строки');
    rowIds.add(source.id); return validateJson(source) as Record<string, JsonValue>;
  });
  validateJson(defaults, 'testSeed');
  return defaults;
}

export function interpolateText(text: string, values: Record<string, JsonValue>): string {
  return text.replace(/\{\{\s*((?:user|conversation|run|bot|event|system)\.[A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, id: string) => {
    const value = values[id]; return value === undefined || value === null ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
  });
}

export function codeContext(run: TestRun): CodeContext {
  const context = Object.fromEntries(scopes.map(scope => [scope, {}])) as CodeContext;
  for(const [id, value] of Object.entries(run.variables)) {
    const [scope, name] = id.split('.'); context[scope as VariableScope][name] = structuredClone(value);
  }
  context.system.now = run.now; context.event.name = run.event?.name ?? ''; context.event.data = run.event?.data ?? null;
  return context;
}

/** Readonly variables have one runtime owner; fixtures cannot override them. */
export function projectRuntimeValues(run: TestRun): Record<string, JsonValue> {
  const variables = {...run.variables};
  for(const definition of Object.values(run.document.variables)) {
    if(definition.scope === 'system' || definition.scope === 'event') delete variables[definition.id];
  }
  if(Object.hasOwn(run.document.variables, 'system.now')) variables['system.now'] = run.now;
  if(Object.hasOwn(run.document.variables, 'event.name')) variables['event.name'] = run.event?.name ?? '';
  if(Object.hasOwn(run.document.variables, 'event.data')) variables['event.data'] = run.event?.data ?? null;
  return variables;
}

export const OrdersColumns: readonly {id: string; label: string; valueType: 'string' | 'number'; readonly: boolean}[] = Object.freeze([
  {id: 'id', label: 'ID', valueType: 'string', readonly: true},
  {id: 'product', label: 'Продукт', valueType: 'string', readonly: false},
  {id: 'status', label: 'Статус', valueType: 'string', readonly: false},
  {id: 'amount', label: 'Сумма', valueType: 'number', readonly: false},
  {id: 'userId', label: 'Пользователь', valueType: 'string', readonly: false},
  {id: 'createdAt', label: 'Создано', valueType: 'number', readonly: true}
]);
