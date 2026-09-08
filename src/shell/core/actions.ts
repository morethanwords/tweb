import type {ActionBlock, JsonValue, TestRun} from './types';
import {resolveValue, validateJson, valueMatches, variable} from './values';

export function writeVariable(run: TestRun, id: string, value: JsonValue): TestRun {
  const definition = variable(run.document, id, true); const checked = validateJson(value);
  if(!valueMatches(checked, definition.valueType)) throw new Error(`Значение не соответствует типу ${id}.`);
  const variables = {...run.variables, [id]: checked}; validateJson(variables, 'run.variables');
  return {...run, variables};
}
export function parseAnswer(run: TestRun, id: string, text: string): JsonValue {
  const type = variable(run.document, id, true).valueType;
  if(type === 'string') return text;
  if(type === 'number') {
    const value = text.trim().replace(',', '.');
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Введите число.');
    return Number(value);
  }
  if(type === 'boolean') {
    if(['true', 'да', '1'].includes(text.trim().toLowerCase())) return true;
    if(['false', 'нет', '0'].includes(text.trim().toLowerCase())) return false;
    throw new Error('Введите да или нет.');
  }
  try {return validateJson(JSON.parse(text));} catch {throw new Error('Введите корректный JSON.');}
}

/** A single action stages all local changes before committing any of them. */
export function applyLocalAction(run: TestRun, block: ActionBlock, attempt: number): {run: TestRun; detail: string} {
  const action = block.action;
  if(action.type === 'set') return {run: writeVariable(run, action.variableId, resolveValue(run.variables, action.value)), detail: `Записано ${action.variableId}`};
  if(action.type === 'increment') {
    const current = run.variables[action.variableId];
    if(typeof current !== 'number' || !Number.isFinite(current + action.amount)) throw new Error('Изменение требует конечного числового значения.');
    return {run: writeVariable(run, action.variableId, current + action.amount), detail: `${action.variableId}: ${current} → ${current + action.amount}`};
  }
  if(action.type === 'http_mock') {
    if(!action.url.trim()) throw new Error('Укажите адрес имитируемого HTTP-запроса.');
    const status = attempt <= action.fixture.failuresBeforeSuccess ? 500 : action.fixture.status;
    if(status < 200 || status >= 300) throw new Error(`Имитация HTTP: ${status}, попытка ${attempt}/${action.attempts}.`);
    const result = {status, body: structuredClone(action.fixture.body), attempt};
    return {run: action.resultVariableId ? writeVariable(run, action.resultVariableId, result) : run, detail: `Имитация HTTP ${status}, попытка ${attempt}`};
  }
  const rows = structuredClone(run.tables.orders);
  const values = (sources: Record<string, Parameters<typeof resolveValue>[1]>) => Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, resolveValue(run.variables, source)]));
  const where = action.type === 'table_create' ? {} : values(action.where);
  const matches = (row: Record<string, JsonValue>) => Object.entries(where).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value));
  let result: JsonValue;
  if(action.type === 'table_create') {
    if(rows.length >= 500) throw new Error('В локальной таблице уже 500 строк.');
    const fields = values(action.values);
    if(Object.hasOwn(fields, 'id')) throw new Error('ID строки назначается системой и не изменяется.');
    const row = {id: `${run.id}:order:${run.cursor.activationId}`, createdAt: run.now, ...fields};
    rows.push(row); result = row;
  } else if(action.type === 'table_find') result = rows.filter(matches);
  else {
    const fields = values(action.values);
    if(Object.hasOwn(fields, 'id')) throw new Error('ID строки назначается системой и не изменяется.');
    let updated = 0;
    for(let index = 0; index < rows.length; index++) if(matches(rows[index])) {rows[index] = {...rows[index], ...fields}; updated++;}
    result = {updated};
  }
  const tables = {orders: rows}; validateJson(tables, 'run.tables');
  const next = {...run, tables};
  return {run: action.resultVariableId ? writeVariable(next, action.resultVariableId, result) : next, detail: `Локальная orders: ${action.type.replace('table_', '')}`};
}
