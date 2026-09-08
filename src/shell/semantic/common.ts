import {createHash, randomUUID} from 'node:crypto';

export const SemanticLimits = Object.freeze({cases: 20, actions: 50, requestBytes: 2 * 1024 * 1024, responseBytes: 32 * 1024,
  caseBytes: 4 * 1024 * 1024, candidateBytes: 32 * 1024 * 1024, retainedBytes: 128 * 1024 * 1024,
  receiptEntries: 4096, receiptBytes: 8 * 1024 * 1024, idleMs: 15 * 60_000, lifetimeMs: 60 * 60_000, workMs: 8000});

export class DomainError extends Error {
  constructor(public readonly code: string, message = code, public readonly details: unknown = null) { super(message); this.name = 'DomainError'; }
}
export function requireThat(condition: unknown, code: string, details: unknown = null): asserts condition {
  if(!condition) throw new DomainError(code, code, details);
}
export function canonical(value: unknown): string {
  if(value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if(typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if(typeof value !== 'object' || !value) throw new DomainError('INVALID_JSON');
  return '{' + Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function bytes(value: unknown): number { return Buffer.byteLength(canonical(value)); }
export function handle(epoch: string, kind: string): string { return `${epoch}:${kind}:${randomUUID()}`; }
export function checkHandle(epoch: string, value: string): void { requireThat(value.startsWith(epoch + ':'), 'INSTANCE_EXPIRED'); }
export function freeze<T>(value: T): T {
  if(value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for(const item of Object.values(value)) freeze(item); }
  return value;
}
export function errorCode(cause: unknown): string {
  return cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code : 'INTERNAL_ERROR';
}
export function boundedInput(value: unknown): void {
  const queue:{value:unknown;depth:number}[]=[{value,depth:0}];let nodes=0;
  while(queue.length) {const item=queue.pop()!;requireThat(++nodes<=50_000&&item.depth<=35,'INPUT_TOO_COMPLEX');
    if(item.value&&typeof item.value==='object')for(const [key,child] of Object.entries(item.value)) {
      requireThat(!['__proto__','prototype','constructor'].includes(key),'INVALID_JSON');queue.push({value:child,depth:item.depth+1});
    }
  }
  requireThat(bytes(value)<=SemanticLimits.requestBytes,'REQUEST_TOO_LARGE');
}
