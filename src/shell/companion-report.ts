import type {ShellDocument} from './core/types';

export type ReportDetailKind = 'assertion' | 'receipt' | 'observation';
export interface FailedCondition {id: string; title: string; expected: string; actual: string; stepId: string | null}
export interface ReportSummary {
  failed: FailedCondition[]; error: string; rows: {stepId: string; label: string}[];
  nextOffset: number | null; oversized: {kind: ReportDetailKind; index: number}[]; evidenceTruncated: boolean;
}
export function reportRecord(value: unknown): Record<string, unknown> | null {return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;}
function text(value: unknown, limit = 180): string {
  const full = typeof value === 'string' ? value : JSON.stringify(value) ?? '—';
  return full.length > limit ? full.slice(0, limit) + '…' : full;
}
function count(expected: Record<string, unknown>): string {
  return expected.max === expected.min ? String(expected.min) : expected.max === null ? `не менее ${expected.min}` : `от ${expected.min} до ${expected.max}`;
}
function owner(document: ShellDocument, messageId?: string, blockId?: string): string | null {
  const block = blockId ?? Object.values(document.blocks).find(item => (item.type === 'message' || item.type === 'ask') && item.messageId === messageId)?.id;
  return block ? Object.entries(document.steps).find(([, step]) => step.blockIds.includes(block))?.[0] ?? null : null;
}
const disposition: Record<string, string> = {accepted: 'принято', rejected: 'отклонено', ignored: 'проигнорировано', duplicate: 'повтор'};

export function summarizeReport(value: unknown, document: ShellDocument): ReportSummary {
  const report = reportRecord(value);
  if(!report || typeof report.reportId !== 'string') throw new Error('Не удалось прочитать отчёт проверки.');
  const failed: FailedCondition[] = [];
  for(const raw of Array.isArray(report.assertions) ? report.assertions : []) {
    const assertion = reportRecord(raw), expected = reportRecord(assertion?.expected);
    if(!assertion || assertion.passed !== false || !expected) continue;
    const item: FailedCondition = {id: String(assertion.id), title: `Условие ${text(assertion.id, 80)}`, expected: text(expected), actual: text(assertion.actual), stepId: null};
    if(expected.type === 'message' && typeof expected.messageId === 'string') {
      item.title = `Сообщение «${text(document.content.messages[expected.messageId] || expected.messageId, 60)}»`;
      item.expected = count(expected) + (typeof expected.contains === 'string' ? ` с текстом «${text(expected.contains, 80)}»` : '');
      item.stepId = owner(document, expected.messageId);
    } else if(expected.type === 'screen' && typeof expected.stepId === 'string') {
      item.title = `Экран «${text(document.content.steps[expected.stepId]?.title || expected.stepId, 60)}»`;
      item.expected = count(expected); item.stepId = document.steps[expected.stepId] ? expected.stepId : null;
    } else if(expected.type === 'effect' && typeof expected.blockId === 'string') {
      item.title = `Выполнение действия ${text(expected.blockId, 60)}`; item.expected = count(expected); item.stepId = owner(document, undefined, expected.blockId);
    } else if(expected.type === 'variable') {
      item.title = `Переменная ${text(expected.variableId, 80)}`;
      const operator = {eq: '=', neq: '≠', gte: '≥', lte: '≤'}[String(expected.operator)] ?? String(expected.operator);
      item.expected = expected.operator === 'exists' ? 'значение задано' : `${operator} ${text(expected.value)}`;
    } else if(expected.type === 'table') {item.title = `Записи в ${text(expected.table, 60)}`; item.expected = count(expected);}
    else if(expected.type === 'receipt') {
      item.title = `Действие ${Number(expected.actionIndex) + 1}`;
      item.expected = (disposition[String(expected.disposition)] ?? String(expected.disposition)) + (expected.code ? ` · ${text(expected.code, 80)}` : '');
      const actual = reportRecord(assertion.actual);
      if(actual) item.actual = (disposition[String(actual.disposition)] ?? String(actual.disposition)) + (actual.code ? ` · ${text(actual.code, 80)}` : '');
    } else if(expected.type === 'stop') {item.title = 'Завершение сценария'; item.expected = text(expected.reason);}
    failed.push(item);
  }
  const error = reportRecord(report.error), details = reportRecord(error?.details);
  const errorMessage = error ? `${text(error.code, 100)}${typeof error.message === 'string' ? ` · ${text(error.message)}` : typeof details?.message === 'string' ? ` · ${text(details.message)}` : error.details !== null && error.details !== undefined ? ` · ${text(error.details)}` : ''}` : '';
  const rows = new Map<string, {stepId: string; label: string}>();
  const addRow = (stepId: unknown) => {if(typeof stepId === 'string' && document.steps[stepId]) rows.set(stepId, {stepId, label: document.content.steps[stepId].title});};
  failed.forEach(item => addRow(item.stepId));
  for(const observation of Array.isArray(report.observations) ? report.observations : []) addRow(reportRecord(observation)?.stepId);
  const oversized: ReportSummary['oversized'] = [];
  for(const raw of Array.isArray(report.oversizedDetails) ? report.oversizedDetails : []) {
    const item = reportRecord(raw);
    if(item && ['assertion', 'receipt', 'observation'].includes(String(item.kind)) && Number.isSafeInteger(item.index)) oversized.push({kind: item.kind as ReportDetailKind, index: item.index as number});
  }
  return {failed, error: errorMessage, rows: [...rows.values()], nextOffset: Number.isSafeInteger(report.nextOffset) ? report.nextOffset as number : null, oversized, evidenceTruncated: report.evidenceTruncated === true};
}
