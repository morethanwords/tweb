import type {Block, Condition, JsonValue, MessageBlock, ShellDocument, Transition} from '../core/types';
import {stepReference} from '../core/navigation';
import type {LogicElementKind} from './LogicIcon';
export type LogicBlock = Exclude<Block, MessageBlock>;
export interface LogicDraft {block: LogicBlock; messageText?: string}

/** IDs and values enter from the caller; no authoring document is mutated by the chooser. */
export function createLogicDraft(type: Exclude<LogicElementKind, 'message'>, id: string, newId: (prefix: string) => string): LogicDraft {
  switch(type) {
    case 'ask': return {block: {id, type, messageId: newId('message'), variableId: 'run.answer', answerType: 'text', choices: [], success: {type: 'continue'}, error: null}, messageText: 'Как к вам обращаться?'};
    case 'decision': return {block: {id, type, cases: [{id: newId('case'), label: 'Баланс достаточен', condition: {variableId: 'user.balance', operator: 'gte', value: {type: 'literal', value: 1000}}, transition: {type: 'continue'}}], otherwise: {type: 'continue'}}};
    case 'action': return {block: {id, type, action: {type: 'increment', variableId: 'user.balance', amount: -1000}, success: {type: 'continue'}, error: null}};
    case 'wait': return {block: {id, type, wait: {type: 'duration', milliseconds: 3 * 86400000, unit: 'days'}, success: {type: 'continue'}, timeout: null}};
    case 'code': return {block: {id, type, name: 'Проверка баланса', source: 'export default async function run(ctx: RoboContext) {\n  const balance = ctx.user.balance;\n  return { outcome: balance >= 1000 ? "success" : "insufficient_balance" };\n}', outcomes: [{id: newId('outcome'), name: 'success', transition: {type: 'continue'}}, {id: newId('outcome'), name: 'insufficient_balance', transition: {type: 'continue'}}], resultVariableId: null}};
  }
}
function baseCaption(document: ShellDocument, block: LogicBlock): string {
  const name = (id: string) => document.variables[id]?.label || id;
  switch(block.type) {
    case 'ask': return `${block.answerType === 'number' ? 'Число' : block.answerType === 'choice' ? `${block.choices.length} варианта` : 'Текст'} → ${name(block.variableId)}`;
    case 'decision': return `${block.cases.length} ${block.cases.length === 1 ? 'условие' : 'условия'} + иначе`;
    case 'action': return block.action.type === 'set' ? `Записать ${name(block.action.variableId)}`
      : block.action.type === 'increment' ? `${name(block.action.variableId)} ${block.action.amount >= 0 ? '+' : '−'} ${Math.abs(block.action.amount)}`
      : block.action.type === 'http_mock' ? `${block.action.method} · локальная имитация`
      : block.action.type === 'table_create' ? 'Создать запись в orders'
      : block.action.type === 'table_find' ? 'Найти записи в orders' : 'Обновить записи в orders';
    case 'wait': return block.wait.type === 'duration' ? `Подождать ${new Intl.NumberFormat('ru-RU', {style: 'unit', unit: {seconds: 'second', minutes: 'minute', hours: 'hour', days: 'day'}[block.wait.unit], unitDisplay: 'long', maximumFractionDigits: 3}).format(block.wait.milliseconds / {seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000}[block.wait.unit])}`
      : block.wait.type === 'date' ? new Date(block.wait.at).toLocaleString('ru-RU')
      : block.wait.type === 'event' ? `Событие: ${block.wait.name}` : 'До сообщения пользователя';
    case 'code': return `${block.name || 'TypeScript'} · ${block.outcomes.length} выхода`;
  }
}
export function blockCaption(document: ShellDocument, block: LogicBlock): string {
  const caption = baseCaption(document, block);
  return 'success' in block && block.success.type !== 'continue' ? `${caption} → ${transitionCaption(document, block.success)}` : caption;
}
export function transitionCaption(document: ShellDocument, transition: Transition): string {
  return transition.type === 'end' ? 'Завершить' : transition.type === 'continue' ? 'Следующий элемент' : stepReference(document, transition.screenId);
}
export function conditionCaption(document: ShellDocument, condition: Condition): string {
  const name = (id: string) => document.variables[id]?.label || id;
  const literal = (value: JsonValue): string => typeof value === 'number' ? value.toLocaleString('ru-RU')
    : typeof value === 'boolean' ? value ? 'Да' : 'Нет' : typeof value === 'string' ? `«${value}»` : JSON.stringify(value);
  if(condition.operator === 'exists') return `${name(condition.variableId)} существует`;
  const operators = {eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'содержит'};
  const rhs = condition.value.type === 'variable' ? name(condition.value.variableId) : literal(condition.value.value);
  return `${name(condition.variableId)} ${operators[condition.operator]} ${rhs.length > 80 ? `${rhs.slice(0, 77)}…` : rhs}`;
}
