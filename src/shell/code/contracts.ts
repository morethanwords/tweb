import {ShellLimits, type CodeRequest as CoreCodeRequest, type JsonValue, type ValueType} from '../core/types';
export type {JsonValue} from '../core/types';
export type VariableType = ValueType;
export type CodeRequest = CoreCodeRequest & {signal?: AbortSignal};
export interface CodeResult {outcome: string; data?: JsonValue}
export interface CodeDiagnostic {line: number; column: number; from: number; to: number; message: string}
export type CodeReply = {ok: true; result?: CodeResult; diagnostics: CodeDiagnostic[]} | {ok: false; error: string; diagnostics: CodeDiagnostic[]};
export const CodeLimits = Object.freeze({sourceBytes: ShellLimits.codeBytes, inputBytes: ShellLimits.codeValueBytes, outputBytes: ShellLimits.codeValueBytes, depth: 20, heapBytes: 16 * 1024 * 1024, memoryPages: 512, executionMs: 500, hostKillMs: 2000});
export type WorkerRequest = {id: number; action: 'validate' | 'execute'; request: Omit<CodeRequest, 'signal'>};
export type WorkerReply = {id: number; reply: CodeReply};

/** No accessors or prototype-bearing objects cross the worker boundary. */
export function jsonSize(value: unknown): string {
  const seen = new Set<object>();
  function visit(current: unknown, depth: number): void {
    if(depth > CodeLimits.depth) throw new Error('Вложенность данных превышает лимит.');
    if(current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if(typeof current === 'number' && Number.isFinite(current)) return;
    if(typeof current !== 'object' || !current) throw new Error('Данные должны быть JSON.');
    if(seen.has(current)) throw new Error('Циклические данные не поддерживаются.');
    seen.add(current);
    if(Array.isArray(current)) current.forEach(item => visit(item, depth + 1));
    else {
      if(Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) throw new Error('Данные должны быть обычным JSON-объектом.');
      for(const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
        if(['__proto__', 'prototype', 'constructor'].includes(key) || !('value' in descriptor)) throw new Error('Недопустимое поле данных.');
        visit(descriptor.value, depth + 1);
      }
    }
    seen.delete(current);
  }
  visit(value, 0);
  return JSON.stringify(value);
}
export function validateRequest(request: Omit<CodeRequest, 'signal'>): void {
  if(typeof request.source !== 'string' || new TextEncoder().encode(request.source).length > CodeLimits.sourceBytes) throw new Error('Код должен занимать не более 32 КБ в UTF-8.');
  if(!request.context || Array.isArray(request.context) || typeof request.context !== 'object') throw new Error('Контекст должен быть JSON-объектом.');
  if(new TextEncoder().encode(jsonSize(request.context)).length > CodeLimits.inputBytes) throw new Error('Контекст превышает 64 КБ.');
  if(!Array.isArray(request.outcomes) || !request.outcomes.length || request.outcomes.length > ShellLimits.outcomes || new Set(request.outcomes).size !== request.outcomes.length || request.outcomes.some(value => typeof value !== 'string' || !value.length || value.length > 80)) throw new Error('Укажите от 1 до 20 уникальных исходов.');
  for(const [key, type] of Object.entries(request.variableTypes ?? {})) {
    if(!/^(user|conversation|run|bot|event|system)\.[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key.split('.')[1]) || !['string', 'number', 'boolean', 'json'].includes(type)) throw new Error('Недопустимое объявление переменной.');
  }
}
